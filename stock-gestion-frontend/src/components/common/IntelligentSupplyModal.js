import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Table, Alert, InputGroup, Spinner, Badge, Accordion } from 'react-bootstrap';
import { fournisseurAPI } from '../../services/api';

const IntelligentSupplyModal = ({ show, onHide, onSuccess, articlesToSupply, preSelectedFournisseurId }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [groupedItems, setGroupedItems] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (show) {
            // Charger les fournisseurs
            fournisseurAPI.getAll()
                .then(res => setFournisseurs(res.data))
                .catch(() => setError("Erreur chargement fournisseurs."));

            // Grouper les articles par fournisseur
            const itemsBySupplier = articlesToSupply.reduce((acc, article) => {
                const supplierId = article.fournisseur?._id || 'unassigned';
                if (!acc[supplierId]) {
                    acc[supplierId] = {
                        id: supplierId,
                        nom: article.fournisseur?.nom || 'Fournisseur non spécifié',
                        items: []
                    };
                }
                acc[supplierId].items.push({
                    nom: article.nom,
                    code: article.code,
                    type: article.type,
                    stockActuel: article.quantite,
                    quantite: 10, // Quantité par défaut
                    prixAchat: article.prixAchat,
                    prixVente: article.prixVente,
                    datePeremption: article.datePeremption ? article.datePeremption.split('T')[0] : '',
                });
                return acc;
            }, {});

            // Si un fournisseur est pré-sélectionné et que des articles sans fournisseur existent,
            // on les assigne à ce fournisseur pré-sélectionné.
            if (preSelectedFournisseurId && itemsBySupplier['unassigned']) {
                if (!itemsBySupplier[preSelectedFournisseurId]) {
                     const supplier = fournisseurs.find(f => f._id === preSelectedFournisseurId);
                     if (supplier) {
                        itemsBySupplier[preSelectedFournisseurId] = {
                            id: preSelectedFournisseurId,
                            nom: supplier.nom,
                            items: []
                        };
                     }
                }
                if (itemsBySupplier[preSelectedFournisseurId]) {
                    itemsBySupplier[preSelectedFournisseurId].items.push(...itemsBySupplier['unassigned'].items);
                    delete itemsBySupplier['unassigned'];
                }
            }

            setGroupedItems(itemsBySupplier);
            // Reset state
            setError('');
        }
    }, [show, articlesToSupply, preSelectedFournisseurId, fournisseurs]);

    const handleItemChange = (supplierId, itemIndex, field, value) => {
        const updatedGroups = { ...groupedItems };
        updatedGroups[supplierId].items[itemIndex][field] = value;
        setGroupedItems(updatedGroups);
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');
        try {
            const supplyPromises = Object.values(groupedItems).map(group => {
                const { id: fournisseurId, items } = group;

                if (fournisseurId === 'unassigned') {
                    setError("Certains articles n'ont pas de fournisseur assigné. Veuillez leur en assigner un.");
                    throw new Error("Fournisseur manquant.");
                }

                if (items.some(item => !item.quantite || item.quantite <= 0 || !item.prixAchat || item.prixAchat <= 0)) {
                    throw new Error(`Pour le fournisseur ${group.nom}, chaque article doit avoir une quantité et un prix d'achat valides.`);
                }

                const invalidItem = items.find(item => item.prixVente > 0 && item.prixAchat >= item.prixVente);
                if (invalidItem) {
                    throw new Error(`Pour l'article "${invalidItem.nom}", le prix d'achat (${invalidItem.prixAchat}) est supérieur ou égal au prix de vente (${invalidItem.prixVente}).`);
                }

                return fournisseurAPI.approvisionner({ fournisseurId, items });
            });

            await Promise.all(supplyPromises);
            onSuccess(); // Callback pour le parent
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Erreur lors de l'approvisionnement.");
        } finally {
            setLoading(false);
        }
    };

    const totalValue = Object.values(groupedItems).reduce((total, group) => {
        return total + group.items.reduce((groupTotal, item) => groupTotal + (item.prixAchat * item.quantite), 0);
    }, 0);

    return (
        <Modal show={show} onHide={onHide} size="xl" centered>
            <Modal.Header closeButton>
                <Modal.Title>
                    <iconify-icon icon="solar:box-up-bold-duotone" className="me-2"></iconify-icon>
                    Approvisionnement Intelligent
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Alert variant="info" className="small">
                    Vous êtes sur le point d'approvisionner le <strong>Dépôt Principal</strong> avec les articles sélectionnés. Les articles sont groupés par fournisseur.
                </Alert>
                {error && <Alert variant="danger">{error}</Alert>}

                <Accordion defaultActiveKey={Object.keys(groupedItems)[0]} alwaysOpen>
                    {Object.values(groupedItems).map((group, groupIndex) => (
                        <Accordion.Item eventKey={group.id} key={group.id}>
                            <Accordion.Header>
                                <span className="fw-bold me-2">Fournisseur: {group.nom}</span> 
                                <Badge pill bg="primary">{group.items.length} article(s)</Badge>
                            </Accordion.Header>
                            <Accordion.Body>
                                <Table striped bordered hover size="sm">
                                    <thead>
                                        <tr>
                                            <th>Article</th>
                                            <th style={{width: '80px'}} className="text-center">Stock</th>
                                            <th style={{width: '120px'}}>Qté Ajout</th>
                                            <th style={{width: '150px'}}>P. Achat</th>
                                            <th style={{width: '150px'}}>P. Vente</th>
                                            <th style={{width: '150px'}}>Péremption</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map((item, itemIndex) => (
                                            <tr key={itemIndex}>
                                                <td className="align-middle fw-bold">{item.nom}</td>
                                                <td className="align-middle text-center">
                                                    <Badge bg={item.stockActuel <= 10 ? 'danger' : 'info'}>{item.stockActuel}</Badge>
                                                </td>
                                                <td>
                                                    <Form.Control type="number" min="1" value={item.quantite} onChange={(e) => handleItemChange(group.id, itemIndex, 'quantite', parseInt(e.target.value) || 0)} required />
                                                </td>
                                                <td>
                                                    <InputGroup size="sm">
                                                        <Form.Control type="number" min="0" value={item.prixAchat} onChange={(e) => handleItemChange(group.id, itemIndex, 'prixAchat', parseFloat(e.target.value) || 0)} required className={item.prixVente > 0 && item.prixAchat >= item.prixVente ? "border-danger text-danger" : ""} />
                                                        <InputGroup.Text>GNF</InputGroup.Text>
                                                    </InputGroup>
                                                </td>
                                                <td>
                                                    <InputGroup size="sm">
                                                        <Form.Control type="number" min="0" value={item.prixVente} onChange={(e) => handleItemChange(group.id, itemIndex, 'prixVente', parseFloat(e.target.value) || 0)} />
                                                        <InputGroup.Text>GNF</InputGroup.Text>
                                                    </InputGroup>
                                                </td>
                                                <td>
                                                    <Form.Control type="date" size="sm" value={item.datePeremption} onChange={(e) => handleItemChange(group.id, itemIndex, 'datePeremption', e.target.value)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </Accordion.Body>
                        </Accordion.Item>
                    ))}
                </Accordion>
            </Modal.Body>
            <Modal.Footer className="d-flex justify-content-between align-items-center">
                <div>
                    <span className="fw-bold">Valeur totale de l'approvisionnement :</span>
                    <Badge bg="success" className="ms-2 fs-6">{totalValue.toLocaleString()} GNF</Badge>
                </div>
                <div>
                    <Button variant="secondary" onClick={onHide} disabled={loading}>Annuler</Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading || Object.keys(groupedItems).length === 0}>
                        {loading ? <Spinner as="span" animation="border" size="sm" /> : "Valider l'Approvisionnement"}
                    </Button>
                </div>
            </Modal.Footer>
        </Modal>
    );
};

export default IntelligentSupplyModal;