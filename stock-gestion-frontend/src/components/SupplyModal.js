import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Table, Alert, InputGroup, Spinner } from 'react-bootstrap';
import { fournisseurAPI, articleAPI } from '../services/api';

const SupplyModal = ({ show, onHide, onSuccess }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [articles, setArticles] = useState([]);
    const [supplyData, setSupplyData] = useState({ fournisseurId: '', items: [] });
    const [newItem, setNewItem] = useState({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0 });
    const [error, setError] = useState('');

    // États pour l'ajout d'un nouveau produit au fournisseur
    const [showAddProductModal, setShowAddProductModal] = useState(false);
    const [newProductName, setNewProductName] = useState('');
    const [addProductLoading, setAddProductLoading] = useState(false);
    const [addProductMessage, setAddProductMessage] = useState({type: '', text: ''});


    useEffect(() => {
        if (show) {
            loadData();
            // Reset form
            setSupplyData({ fournisseurId: '', items: [] });
            setNewItem({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0 });
            setError('');
        }
    }, [show]);

    const loadData = async () => {
        try {
            const [fournisseursRes, articlesRes] = await Promise.all([
                fournisseurAPI.getAll(),
                articleAPI.getAll()
            ]);
            setFournisseurs(fournisseursRes.data);
            setArticles(articlesRes.data);
        } catch (err) {
            setError("Erreur lors du chargement des données.");
        }
    };

    const addItemToSupply = () => {
        if (!newItem.nom || newItem.quantite <= 0 || newItem.prixAchat <= 0) {
            setError("Veuillez renseigner le nom, la quantité et le prix d'achat.");
            return;
        }
        if (newItem.prixVente > 0 && Number(newItem.prixAchat) >= Number(newItem.prixVente)) {
            setError("Le prix de vente doit être supérieur au prix d'achat.");
            return;
        }
        setError(''); // Nettoie les erreurs précédentes

        const existingItemIndex = supplyData.items.findIndex(item => item.nom === newItem.nom);

        if (existingItemIndex > -1) {
            // L'article existe déjà : on met à jour la ligne existante
            const updatedItems = supplyData.items.map((item, index) => {
                if (index === existingItemIndex) {
                    return {
                        ...item,
                        quantite: item.quantite + parseInt(newItem.quantite),
                        prixAchat: newItem.prixAchat, // Mise à jour avec le dernier prix saisi
                        prixVente: newItem.prixVente,   // Mise à jour avec le dernier prix saisi
                    };
                }
                return item;
            });
            setSupplyData({ ...supplyData, items: updatedItems });
        } else {
            // Nouvel article : on l'ajoute à la liste
            setSupplyData({ ...supplyData, items: [...supplyData.items, newItem] });
        }

        // Réinitialiser le formulaire d'ajout
        setNewItem({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0 });
    };

    const removeItemFromSupply = (index) => {
        const newItems = [...supplyData.items];
        newItems.splice(index, 1);
        setSupplyData({ ...supplyData, items: newItems });
    };

    const handleAddProductToSupplier = async (e) => {
        e.preventDefault();
        if (!newProductName) {
            setAddProductMessage({ type: 'warning', text: 'Le nom du produit ne peut pas être vide.' });
            return;
        }
        setAddProductLoading(true);
        setAddProductMessage({ type: '', text: '' });
    
        const supplier = fournisseurs.find(f => f._id === supplyData.fournisseurId);
        if (!supplier) {
            setAddProductMessage({ type: 'danger', text: 'Fournisseur non trouvé.' });
            setAddProductLoading(false);
            return;
        }
    
        if (supplier.produitsProposes.find(p => p.toLowerCase() === newProductName.toLowerCase())) {
            setAddProductMessage({ type: 'info', text: 'Ce produit existe déjà pour ce fournisseur.' });
            setAddProductLoading(false);
            return;
        }
    
        const updatedProduits = [...supplier.produitsProposes, newProductName];
        const payload = { ...supplier, produitsProposes: updatedProduits };
        
        try {
            await fournisseurAPI.update(supplier._id, payload);
            setShowAddProductModal(false);
            setNewProductName('');
            await loadData(); // Recharge les données pour mettre à jour les listes
            onSuccess(`Produit "${newProductName}" ajouté au fournisseur ${supplier.nom}.`);
        } catch (err) {
            setAddProductMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors de l'ajout du produit." });
        } finally {
            setAddProductLoading(false);
        }
    };

    const submitSupply = async () => {
        if (!supplyData.fournisseurId) {
            setError("Veuillez sélectionner un fournisseur.");
            return;
        }
        try {
            await fournisseurAPI.approvisionner({ fournisseurId: supplyData.fournisseurId, items: supplyData.items });
            onSuccess("Approvisionnement de la Boutique Centrale réussi !");
            onHide();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur approvisionnement");
        }
    };

    const selectedFournisseur = fournisseurs.find(f => f._id === supplyData.fournisseurId);
    
    // Trouver l'article existant pour afficher ses infos
    const existingArticle = newItem.nom ? (articles.find(a => a.nom === newItem.nom && a.boutique?.type === 'Centrale') 
                                        || articles.find(a => a.nom === newItem.nom)) : null;

    return (
        <>
            <Modal show={show} onHide={onHide} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Approvisionner la <span className="text-primary">Boutique Centrale</span></Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Alert variant="info" className="small">
                    Les articles ajoutés ici iront directement dans le stock de la Boutique Centrale.
                </Alert>
                {error && <Alert variant="danger">{error}</Alert>}

                <Form.Group className="mb-4">
                    <Form.Label>Sélectionner le Fournisseur</Form.Label>
                    <Form.Select 
                        value={supplyData.fournisseurId}
                        onChange={(e) => setSupplyData({ ...supplyData, fournisseurId: e.target.value, items: [] })}
                    >
                        <option value="">Choisir un fournisseur...</option>
                        {fournisseurs.map(f => <option key={f._id} value={f._id}>{f.nom}</option>)}
                    </Form.Select>
                </Form.Group>

                {supplyData.fournisseurId && (
                    <>
                        <div className="p-3 bg-light rounded mb-3">
                            <Row className="g-2 align-items-end">
                                <Col md={4}>
                                    <Form.Label>Article</Form.Label>
                                    <InputGroup>
                                        <Form.Select
                                            value={newItem.nom} 
                                            onChange={e => {
                                                const nom = e.target.value;
                                                const existingArticle = articles.find(a => a.nom === nom && a.boutique?.type === 'Centrale') 
                                                                    || articles.find(a => a.nom === nom);
                                                setNewItem({
                                                    ...newItem, 
                                                    nom: nom,
                                                    prixAchat: existingArticle ? existingArticle.prixAchat : 0,
                                                    prixVente: existingArticle ? existingArticle.prixVente : 0
                                                });
                                            }} 
                                        >
                                            <option value="">Choisir un article...</option>
                                            {selectedFournisseur?.produitsProposes?.map((p, i) => (
                                                <option key={i} value={p}>{p}</option>
                                            ))}
                                            {/* Ajout des articles existants pour compléter la liste */}
                                            {articles.map(a => a.nom).filter(n => !selectedFournisseur?.produitsProposes?.includes(n))
                                                .filter((v, i, a) => a.indexOf(v) === i) // Unique
                                                .map((nom, i) => {
                                                    const art = articles.find(a => a.nom === nom);
                                                    return <option key={`existing-${i}`} value={nom}>{art?.code ? `[${art.code}] ` : ''}{nom}</option>
                                                })
                                            }
                                        </Form.Select>
                                        <Button variant="primary" onClick={() => setShowAddProductModal(true)} title="Ajouter un nouveau produit à ce fournisseur">
                                            <iconify-icon icon="solar:add-circle-bold-duotone" style={{ fontSize: '20px' }}></iconify-icon>
                                        </Button>
                                    </InputGroup>
                                </Col>
                                <Col md={2}><Form.Label>Qté</Form.Label><Form.Control type="number" min="1" value={newItem.quantite} onChange={e => setNewItem({...newItem, quantite: parseInt(e.target.value)})} /></Col>
                                <Col md={2}><Form.Label>P. Achat</Form.Label><Form.Control type="number" min="0" value={newItem.prixAchat} onChange={e => setNewItem({...newItem, prixAchat: parseInt(e.target.value)})} /></Col>
                                <Col md={2}><Form.Label>P. Vente</Form.Label><Form.Control type="number" min="0" value={newItem.prixVente} onChange={e => setNewItem({...newItem, prixVente: parseInt(e.target.value)})} /></Col>
                                <Col md={2}><Button variant="primary" className="w-100" onClick={addItemToSupply}>Ajouter</Button></Col>
                            </Row>
                            
                            {existingArticle && (
                                <div className="mt-3 pt-2 border-top d-flex flex-wrap gap-3 text-muted small">
                                    <span className="d-flex align-items-center"><iconify-icon icon="solar:box-minimalistic-bold" className="me-1"></iconify-icon> Stock actuel: <strong className="ms-1">{existingArticle.quantite}</strong></span>
                                    <span className="d-flex align-items-center"><iconify-icon icon="solar:tag-price-bold" className="me-1"></iconify-icon> Ancien P. Achat: <strong className="ms-1">{existingArticle.prixAchat.toLocaleString()} GNF</strong></span>
                                    <span className="d-flex align-items-center"><iconify-icon icon="solar:tag-bold" className="me-1"></iconify-icon> Ancien P. Vente: <strong className="ms-1">{existingArticle.prixVente.toLocaleString()} GNF</strong></span>
                                </div>
                            )}
                        </div>

                        <Table striped bordered hover size="sm">
                            <thead>
                                <tr><th>Article</th><th>Qté</th><th>P. Achat</th><th>P. Vente</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                {supplyData.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.nom}</td><td>{item.quantite}</td><td>{item.prixAchat.toLocaleString()}</td><td>{item.prixVente ? item.prixVente.toLocaleString() : '-'}</td>
                                        <td><Button variant="link" className="text-danger p-0" onClick={() => removeItemFromSupply(idx)}><iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon></Button></td>
                                    </tr>
                                ))}
                                {supplyData.items.length === 0 && <tr><td colSpan="5" className="text-center text-muted">Aucun article ajouté</td></tr>}
                            </tbody>
                        </Table>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Annuler</Button>
                <Button variant="success" onClick={submitSupply} disabled={supplyData.items.length === 0}>Valider</Button>
            </Modal.Footer>
            </Modal>

            {/* Modale pour ajouter un nouveau produit au fournisseur */}
            <Modal show={showAddProductModal} onHide={() => setShowAddProductModal(false)} centered size="sm">
                <Modal.Header closeButton>
                    <Modal.Title>Nouveau Produit</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleAddProductToSupplier}>
                    <Modal.Body>
                        {addProductMessage.text && <Alert variant={addProductMessage.type}>{addProductMessage.text}</Alert>}
                        <p className="small text-muted">Ajouter un nouveau type de produit à la liste proposée par <strong>{selectedFournisseur?.nom}</strong>.</p>
                        <Form.Group>
                            <Form.Label>Nom du nouveau produit</Form.Label>
                            <Form.Control 
                                type="text"
                                value={newProductName}
                                onChange={(e) => setNewProductName(e.target.value)}
                                required
                                placeholder="Ex: Savon de Marseille"
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowAddProductModal(false)}>Annuler</Button>
                        <Button variant="primary" type="submit" disabled={addProductLoading}>
                            {addProductLoading ? <Spinner size="sm" /> : 'Ajouter'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </>
    );
};
export default SupplyModal;