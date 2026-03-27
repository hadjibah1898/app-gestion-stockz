import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Table, Alert, InputGroup, Spinner, Badge, Accordion } from 'react-bootstrap';
import { fournisseurAPI } from '../../services/api';

const IntelligentSupplyModal = ({ show, onHide, onSuccess, articlesToSupply = [], preSelectedFournisseurId }) => {
    const [groupedItems, setGroupedItems] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const loadInitialData = useCallback(async () => {
        try {
            const res = await fournisseurAPI.getAll();
            const allSuppliers = res.data;
            // setFournisseurs(allSuppliers); // Cette ligne est supprimée car 'fournisseurs' n'est pas utilisé directement

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
                    articleId: article._id,
                    nom: article.nom,
                    code: article.code,
                    type: article.type,
                    stockActuel: article.quantite,
                    // Utilisation de chaînes pour éviter le blocage du clavier (NaN)
                    quantite: '10', 
                    prixAchat: article.prixAchat ? String(article.prixAchat) : '',
                    prixVente: article.prixVente ? String(article.prixVente) : '',
                    datePeremption: article.datePeremption ? article.datePeremption.split('T')[0] : '',
                });
                return acc;
            }, {});

            // Assigner les "non assignés" si un fournisseur par défaut est présent
            if (preSelectedFournisseurId && itemsBySupplier['unassigned']) {
                const targetSupplier = allSuppliers.find(f => f._id === preSelectedFournisseurId);
                if (targetSupplier) {
                    if (!itemsBySupplier[preSelectedFournisseurId]) {
                        itemsBySupplier[preSelectedFournisseurId] = {
                            id: preSelectedFournisseurId,
                            nom: targetSupplier.nom,
                            items: []
                        };
                    }
                    itemsBySupplier[preSelectedFournisseurId].items.push(...itemsBySupplier['unassigned'].items);
                    delete itemsBySupplier['unassigned'];
                }
            }

            setGroupedItems(itemsBySupplier);
            setError('');
        } catch (err) {
            setError("Erreur lors de l'initialisation des données.");
        }
    }, [articlesToSupply, preSelectedFournisseurId, setGroupedItems, setError]);

    useEffect(() => {
        if (show) {
            loadInitialData();
        }
    }, [show, loadInitialData]);

    const handleItemChange = (supplierId, itemIndex, field, value) => {
        // On garde la valeur en string pour permettre l'effacement total au clavier
        const updatedGroups = { ...groupedItems };
        updatedGroups[supplierId].items[itemIndex][field] = value;
        setGroupedItems({ ...updatedGroups });
    };

    const handleSubmit = async () => {
        setLoading(true);
        setError('');
        try {
            const groups = Object.values(groupedItems);
            
            // Validation avant envoi
            for (const group of groups) {
                if (group.id === 'unassigned') {
                    throw new Error("Certains articles n'ont pas de fournisseur assigné.");
                }

                for (const item of group.items) {
                    const qte = Number(item.quantite);
                    const pA = Number(item.prixAchat);
                    const pV = Number(item.prixVente);

                    if (isNaN(qte) || qte <= 0) throw new Error(`Quantité invalide pour ${item.nom}`);
                    if (isNaN(pA) || pA <= 0) throw new Error(`Prix d'achat invalide pour ${item.nom}`);
                    if (pV > 0 && pA >= pV) throw new Error(`Le prix d'achat de ${item.nom} doit être inférieur au prix de vente.`);
                }
            }

            const supplyPromises = groups.map(group => {
                // Conversion finale en nombres pour l'API
                const cleanItems = group.items.map(item => ({
                    ...item,
                    quantite: Number(item.quantite),
                    prixAchat: Number(item.prixAchat),
                    prixVente: Number(item.prixVente)
                }));
                return fournisseurAPI.approvisionner({ fournisseurId: group.id, items: cleanItems });
            });

            await Promise.all(supplyPromises);
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Erreur lors de l'approvisionnement.");
        } finally {
            setLoading(false);
        }
    };

    const calculateTotal = () => {
        return Object.values(groupedItems).reduce((total, group) => {
            return total + group.items.reduce((groupTotal, item) => {
                const qte = Number(item.quantite) || 0;
                const prix = Number(item.prixAchat) || 0;
                return groupTotal + (qte * prix);
            }, 0);
        }, 0);
    };

    return (
        <Modal show={show} onHide={onHide} size="xl" centered backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title className="d-flex align-items-center">
                    <span className="me-2 text-primary">📦</span>
                    Approvisionnement Intelligent
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Alert variant="info" className="small border-0 shadow-sm">
                    Les articles sont groupés par fournisseur. Ils seront ajoutés au <strong>Dépôt Principal</strong>.
                </Alert>
                
                {error && <Alert variant="danger">{error}</Alert>}

                <Accordion defaultActiveKey={Object.keys(groupedItems)[0]} alwaysOpen>
                    {Object.values(groupedItems).map((group) => (
                        <Accordion.Item eventKey={group.id} key={group.id} className="mb-3 border shadow-sm">
                            <Accordion.Header>
                                <div className="d-flex justify-content-between w-100 me-3">
                                    <span className="fw-bold text-dark">Fournisseur : {group.nom}</span>
                                    <Badge pill bg="primary">{group.items.length} article(s)</Badge>
                                </div>
                            </Accordion.Header>
                            <Accordion.Body>
                                <Table responsive striped hover size="sm">
                                    <thead>
                                        <tr className="bg-light">
                                            <th>Article</th>
                                            <th className="text-center">Stock</th>
                                            <th style={{ width: '110px' }}>Qté Ajout</th>
                                            <th style={{ width: '140px' }}>P. Achat</th>
                                            <th style={{ width: '140px' }}>P. Vente</th>
                                            <th style={{ width: '150px' }}>Péremption</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="align-middle">
                                                    <div className="fw-bold">{item.nom}</div>
                                                    <small className="text-muted">{item.code}</small>
                                                </td>
                                                <td className="align-middle text-center">
                                                    <Badge bg={item.stockActuel <= 5 ? 'danger' : 'secondary'}>
                                                        {item.stockActuel}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    <Form.Control 
                                                        type="number" 
                                                        value={item.quantite} 
                                                        onChange={(e) => handleItemChange(group.id, idx, 'quantite', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    <InputGroup size="sm">
                                                        <Form.Control 
                                                            type="number" 
                                                            value={item.prixAchat}
                                                            onChange={(e) => handleItemChange(group.id, idx, 'prixAchat', e.target.value)}
                                                            isInvalid={Number(item.prixAchat) >= Number(item.prixVente) && Number(item.prixVente) > 0}
                                                        />
                                                        <InputGroup.Text className="small px-1">GNF</InputGroup.Text>
                                                    </InputGroup>
                                                </td>
                                                <td>
                                                    <InputGroup size="sm">
                                                        <Form.Control 
                                                            type="number" 
                                                            value={item.prixVente}
                                                            onChange={(e) => handleItemChange(group.id, idx, 'prixVente', e.target.value)}
                                                        />
                                                        <InputGroup.Text className="small px-1">GNF</InputGroup.Text>
                                                    </InputGroup>
                                                </td>
                                                <td>
                                                    <Form.Control 
                                                        type="date" 
                                                        size="sm" 
                                                        value={item.datePeremption} 
                                                        onChange={(e) => handleItemChange(group.id, idx, 'datePeremption', e.target.value)}
                                                    />
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
            <Modal.Footer className="bg-light d-flex justify-content-between">
                <div className="text-start">
                    <small className="text-muted d-block">Valeur totale estimée :</small>
                    <span className="h5 fw-bold text-success">{calculateTotal().toLocaleString()} GNF</span>
                </div>
                <div>
                    <Button variant="outline-secondary" onClick={onHide} className="me-2" disabled={loading}>
                        Annuler
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading || Object.keys(groupedItems).length === 0}>
                        {loading ? <Spinner animation="border" size="sm" className="me-2" /> : null}
                        Confirmer l'approvisionnement
                    </Button>
                </div>
            </Modal.Footer>
        </Modal>
    );
};

export default IntelligentSupplyModal;