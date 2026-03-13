import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Table, Alert, InputGroup, } from 'react-bootstrap';
import { fournisseurAPI, articleAPI } from '../services/api';
import NewProductForSupplyModal from './common/NewProductForSupplyModal';

const SupplyModal = ({ show, onHide, onSuccess }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [articles, setArticles] = useState([]);
    const [supplyData, setSupplyData] = useState({ fournisseurId: '', items: [] });
    const [newItem, setNewItem] = useState({ articleId: null, nom: '', code: '', type: '', quantite: 10, prixAchat: 0, prixVente: 0 });
    const [error, setError] = useState('');

    const [showAddProductModal, setShowAddProductModal] = useState(false);
    const [newProductName, setNewProductName] = useState('');
    const [addProductLoading, setAddProductLoading] = useState(false);
    const [addProductMessage, setAddProductMessage] = useState({type: '', text: ''});
    const [showNewProductModal, setShowNewProductModal] = useState(false);

    useEffect(() => {
        if (show) {
            loadData();
            setSupplyData({ fournisseurId: '', items: [] });
            setNewItem({ articleId: null, nom: '', code: '', type: '', quantite: 10, prixAchat: 0, prixVente: 0 });
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
        // Correction : Utilisation de Number() pour éviter les bugs de parseInt
        const quantiteNum = Number(newItem.quantite);
        const prixAchatNum = Number(newItem.prixAchat);
        const prixVenteNum = Number(newItem.prixVente);

        if (!newItem.nom || isNaN(quantiteNum) || quantiteNum <= 0 || isNaN(prixAchatNum) || prixAchatNum <= 0) {
            setError("Veuillez renseigner le nom, la quantité et le prix d'achat.");
            return;
        }
        
        if (prixVenteNum > 0 && prixAchatNum >= prixVenteNum) {
            setError("Le prix de vente doit être supérieur au prix d'achat.");
            return;
        }

        setError('');

        const existingItemIndex = supplyData.items.findIndex(item => item.nom === newItem.nom);
    
        if (existingItemIndex > -1) {
            const updatedItems = supplyData.items.map((item, index) => {
                if (index === existingItemIndex) {
                    return {
                        ...item,
                        quantite: item.quantite + quantiteNum,
                        prixAchat: prixAchatNum,
                        prixVente: prixVenteNum > 0 ? prixVenteNum : item.prixVente,
                    };
                }
                return item;
            });
            setSupplyData({ ...supplyData, items: updatedItems });
        } else {
            const itemToAdd = {
                ...newItem,
                quantite: quantiteNum,
                prixAchat: prixAchatNum,
                prixVente: prixVenteNum,
            };
            setSupplyData({ ...supplyData, items: [...supplyData.items, itemToAdd] });
        }

        setNewItem({ articleId: null, nom: '', code: '', type: '', quantite: 10, prixAchat: 0, prixVente: 0 });
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
            await loadData();
            onSuccess(`Produit "${newProductName}" ajouté au fournisseur ${supplier.nom}.`);
        } catch (err) {
            setAddProductMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors de l'ajout." });
        } finally {
            setAddProductLoading(false);
        }
    };

    const handleAddNewProductToSupply = (productData) => {
        setSupplyData(prev => ({
            ...prev,
            items: [...prev.items, productData]
        }));
    };

    const submitSupply = async () => {
        if (!supplyData.fournisseurId) {
            setError("Veuillez sélectionner un fournisseur.");
            return;
        }
        try {
            await fournisseurAPI.approvisionner({ fournisseurId: supplyData.fournisseurId, items: supplyData.items });
            onSuccess("Approvisionnement réussi !");
            onHide();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur approvisionnement");
        }
    };

    const selectedFournisseur = fournisseurs.find(f => f._id === supplyData.fournisseurId);
    const existingArticle = newItem.nom ? articles.find(a => a.nom === newItem.nom) : null;

    return (
        <>
            <Modal show={show} onHide={onHide} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Approvisionner le <span className="text-primary">Dépôt Principal</span></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Alert variant="info" className="small">Les articles ajoutés iront au Dépôt Principal.</Alert>
                    {error && <Alert variant="danger">{error}</Alert>}

                    <Form.Group className="mb-4">
                        <Form.Label>Fournisseur</Form.Label>
                        <Form.Select 
                            value={supplyData.fournisseurId}
                            onChange={(e) => setSupplyData({ ...supplyData, fournisseurId: e.target.value, items: [] })}
                        >
                            <option value="">Choisir un fournisseur...</option>
                            {fournisseurs.map(f => <option key={f._id} value={f._id}>{f.nom}</option>)}
                        </Form.Select>
                    </Form.Group>

                    {supplyData.fournisseurId && (
                        <div className="p-3 bg-light rounded mb-3">
                            <Row className="g-2 align-items-center">
                                <Col md={4}>
                                    <Form.Label>Article</Form.Label>
                                    <InputGroup>
                                        <Form.Select
                                            value={newItem.nom} 
                                            onChange={e => {
                                                const nom = e.target.value;
                                                const art = articles.find(a => a.nom === nom);
                                                setNewItem({
                                                    ...newItem, 
                                                    articleId: art ? art._id : null,
                                                    nom: nom,
                                                    code: art ? art.code : '',
                                                    type: art ? art.type : 'Divers',
                                                    prixAchat: art ? art.prixAchat : 0,
                                                    prixVente: art ? art.prixVente : 0
                                                });
                                            }} 
                                        >
                                            <option value="">Sélectionner article...</option>
                                            {selectedFournisseur?.produitsProposes?.map((p, i) => (
                                                <option key={i} value={p}>{p}</option>
                                            ))}
                                        </Form.Select>
                                        <Button variant="outline-secondary" onClick={() => setShowAddProductModal(true)}>
                                            +
                                        </Button>
                                    </InputGroup>
                                </Col>
                                <Col md={8} className="d-flex align-items-end">
                                    <Button variant="success" onClick={() => setShowNewProductModal(true)} className="w-100">
                                        Créer un nouveau produit non catalogué
                                    </Button>
                                </Col>
                            </Row>
                            <Row className="g-2 align-items-end mt-2">
                                <Col md={3}>
                                    <Form.Label>Qté</Form.Label>
                                    <Form.Control type="number" value={newItem.quantite} onChange={e => setNewItem({...newItem, quantite: e.target.value})} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label>P. Achat</Form.Label>
                                    <Form.Control type="number" value={newItem.prixAchat} onChange={e => setNewItem({...newItem, prixAchat: e.target.value})} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label>P. Vente</Form.Label>
                                    <Form.Control type="number" value={newItem.prixVente} onChange={e => setNewItem({...newItem, prixVente: e.target.value})} />
                                </Col>
                                <Col md={3}>
                                    <Button variant="primary" className="w-100" onClick={addItemToSupply}>Ajouter au lot</Button>
                                </Col>
                            </Row>
                            {existingArticle && (
                                <div className="mt-2 small text-muted">
                                    Stock actuel: <strong>{existingArticle.quantite}</strong> | Ancien P.A: <strong>{existingArticle.prixAchat}</strong>
                                </div>
                            )}
                        </div>
                    )}

                    <Table striped bordered hover size="sm">
                        <thead>
                            <tr>
                                <th>Article</th><th>Qté</th><th>P. Achat</th><th>P. Vente</th><th>Total</th><th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {supplyData.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.nom}</td>
                                    <td>{item.quantite}</td>
                                    <td>{Number(item.prixAchat).toLocaleString()}</td>
                                    <td>{Number(item.prixVente).toLocaleString()}</td>
                                    <td className="fw-bold">{(item.quantite * item.prixAchat).toLocaleString()} GNF</td>
                                    <td><Button variant="link" className="text-danger p-0" onClick={() => removeItemFromSupply(idx)}>Suppr.</Button></td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>Annuler</Button>
                    <Button variant="success" onClick={submitSupply} disabled={supplyData.items.length === 0}>Valider</Button>
                </Modal.Footer>
            </Modal>

            {/* Modal ajout produit au catalogue fournisseur */}
            <Modal show={showAddProductModal} onHide={() => setShowAddProductModal(false)} centered>
                <Modal.Header closeButton><Modal.Title>Nouveau produit catalogue</Modal.Title></Modal.Header>
                <Form onSubmit={handleAddProductToSupplier}>
                    <Modal.Body>
                        {addProductMessage.text && <Alert variant={addProductMessage.type}>{addProductMessage.text}</Alert>}
                        <Form.Control placeholder="Nom du produit" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} required />
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="primary" type="submit" disabled={addProductLoading}>Ajouter</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            <NewProductForSupplyModal 
                show={showNewProductModal}
                onHide={() => setShowNewProductModal(false)}
                onAddProduct={handleAddNewProductToSupply}
            />
        </>
    );
};

export default SupplyModal;

