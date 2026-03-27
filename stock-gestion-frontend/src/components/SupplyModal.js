import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Table, Alert, InputGroup, Spinner, Badge } from 'react-bootstrap';
import { fournisseurAPI, articleAPI } from '../services/api';

const SupplyModal = ({ show, onHide, onSuccess }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [articles, setArticles] = useState([]);
    const [supplyData, setSupplyData] = useState({ fournisseurId: '', items: [] });
    const [newItem, setNewItem] = useState({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', type: 'Divers', datePeremption: '' });
    const [error, setError] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);

    useEffect(() => {
        if (show) {
            loadData();
            setSupplyData({ fournisseurId: '', items: [] });
            setNewItem({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', type: 'Divers', datePeremption: '' });
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
            setArticles(articlesRes.data.data || []);
        } catch (err) {
            setError("Erreur lors du chargement des données.");
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Compression en JPEG à 70% de qualité
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                    setNewItem(prev => ({ ...prev, image: compressedBase64 }));
                };
            };
            reader.readAsDataURL(file);
        }
    };

    const handleProductSelect = (productName) => {
        const art = articles.find(a => a.nom.toLowerCase() === productName.toLowerCase());
        setNewItem({
            ...newItem,
            nom: productName,
            // Si l'article existe, on pré-remplit ses données pour faciliter la mise à jour
            prixAchat: art ? art.prixAchat : 0,
            prixVente: art ? art.prixVente : 0,
            code: art ? art.code : '',
            type: art ? art.type : 'Divers',
            image: art ? art.image : '',
            datePeremption: art ? (art.datePeremption ? art.datePeremption.split('T')[0] : '') : ''
        });
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

        setNewItem({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', type: 'Divers', datePeremption: '' });
    };

    const removeItemFromSupply = (index) => {
        const newItems = [...supplyData.items];
        newItems.splice(index, 1);
        setSupplyData({ ...supplyData, items: newItems });
    };

    const submitSupply = async () => {
        if (!supplyData.fournisseurId) {
            setError("Veuillez sélectionner un fournisseur.");
            return;
        }
        setSubmitLoading(true);
        setError('');
        try {
            await fournisseurAPI.approvisionner({ fournisseurId: supplyData.fournisseurId, items: supplyData.items });
            onSuccess("Approvisionnement réussi !");
            onHide();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur approvisionnement");
        } finally {
            setSubmitLoading(false);
        }
    };

    const selectedFournisseur = fournisseurs.find(f => f._id === supplyData.fournisseurId);
    const existingArticle = newItem.nom ? articles.find(a => a.nom === newItem.nom) : null;

    return (
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
                            <Row className="g-3">
                                <Col md={12} lg={5}>
                                    <Form.Label>Article</Form.Label>
                                    <InputGroup>
                                        <Form.Control
                                            list="product-list"
                                            placeholder="Taper ou sélectionner un produit..."
                                            value={newItem.nom}
                                            onChange={e => handleProductSelect(e.target.value)}
                                        />
                                        <datalist id="product-list">
                                            {selectedFournisseur?.produitsProposes?.map((p, i) => <option key={i} value={p} />)}
                                        </datalist>
                                    </InputGroup>
                                </Col>
                                <Col md={4} lg={2}>
                                    <Form.Label>Qté</Form.Label>
                                    <Form.Control type="number" value={newItem.quantite} onChange={e => setNewItem({...newItem, quantite: e.target.value})} />
                                </Col>
                                <Col md={4} lg={2}>
                                    <Form.Label>P. Achat</Form.Label>
                                    <Form.Control type="number" value={newItem.prixAchat} onChange={e => setNewItem({...newItem, prixAchat: e.target.value})} />
                                    {existingArticle && <Form.Text className="text-muted">Actuel: {existingArticle.prixAchat.toLocaleString()} GNF</Form.Text>}
                                </Col>
                                <Col md={4} lg={3}>
                                    <Form.Label>P. Vente</Form.Label>
                                    <Form.Control type="number" value={newItem.prixVente} onChange={e => setNewItem({...newItem, prixVente: e.target.value})} />
                                    {existingArticle && <Form.Text className="text-muted">Actuel: {existingArticle.prixVente.toLocaleString()} GNF</Form.Text>}
                                </Col>
                                <Col md={4} lg={3}>
                                    <Form.Label>Code Article</Form.Label>
                                    <Form.Control type="text" placeholder="REF-001" value={newItem.code} onChange={e => setNewItem({...newItem, code: e.target.value})} />
                                </Col>
                                <Col md={4} lg={3}>
                                    <Form.Label>Type</Form.Label>
                                    <Form.Control type="text" placeholder="Boisson, Ciment..." value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})} />
                                </Col>
                                <Col md={4} lg={3}>
                                    <Form.Label>Date Péremption</Form.Label>
                                    <Form.Control type="date" value={newItem.datePeremption} onChange={e => setNewItem({...newItem, datePeremption: e.target.value})} />
                                </Col>
                                <Col md={12} lg={3}>
                                    <Form.Label><iconify-icon icon="solar:camera-bold" className="me-1"></iconify-icon> Image (Optionnel)</Form.Label>
                                    <Form.Control type="file" accept="image/*" capture="environment" onChange={handleImageChange} size="sm" />
                                </Col>
                            </Row>
                            <Row className="mt-3">
                                <Col md={9}>
                                    {newItem.image && (
                                        <div className="d-flex align-items-center gap-2">
                                            <img src={newItem.image} alt="Aperçu" className="rounded shadow-sm" style={{maxHeight: '50px'}} />
                                            <Button variant="link" size="sm" className="text-danger p-0" onClick={() => setNewItem(prev => ({...prev, image: ''}))}>Retirer</Button>
                                        </div>
                                    )}
                                </Col>
                                <Col md={3} className="d-flex align-items-end">
                                    <Button variant="primary" className="w-100" onClick={addItemToSupply}>Ajouter au lot</Button>
                                </Col>
                            </Row>
                            {existingArticle && (
                                <div className="mt-3 p-2 bg-white rounded border border-2 small">
                                    <strong>Info Article Existant :</strong> Stock actuel: <Badge bg="info">{existingArticle.quantite}</Badge>
                                </div>
                            )}
                        </div>
                    )}

                    <Table striped bordered hover size="sm">
                        <thead>
                            <tr className="text-center">
                                <th>Article</th><th>Qté</th><th>P. Achat</th><th>P. Vente</th><th>Total</th><th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {supplyData.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{item.nom}</td>
                                    <td className="text-center">{item.quantite}</td>
                                    <td className="text-end">{Number(item.prixAchat).toLocaleString()} GNF</td>
                                    <td className="text-end">{Number(item.prixVente).toLocaleString()} GNF</td>
                                    <td className="fw-bold">{(item.quantite * item.prixAchat).toLocaleString()} GNF</td>
                                    <td className="text-center"><Button variant="link" className="text-danger p-0" onClick={() => removeItemFromSupply(idx)}>Suppr.</Button></td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide} disabled={submitLoading}>Annuler</Button>
                    <Button variant="success" onClick={submitSupply} disabled={supplyData.items.length === 0 || submitLoading}>
                        {submitLoading ? <Spinner as="span" size="sm" /> : 'Valider l\'Approvisionnement'}
                    </Button>
                </Modal.Footer>
            </Modal>
    );
};

export default SupplyModal;
