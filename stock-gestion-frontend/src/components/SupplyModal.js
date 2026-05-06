import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Table, Alert, InputGroup, Spinner, Badge, Card } from 'react-bootstrap';
import { fournisseurAPI, articleAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const SupplyModal = ({ show, onHide, onSuccess }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [articles, setArticles] = useState([]);
    const [supplyData, setSupplyData] = useState({ fournisseurId: '', items: [], imageJustificatif: '' });
    const [customCategories, setCustomCategories] = useState([]);
    const [newItem, setNewItem] = useState({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', datePeremption: '', categorie: 'Divers' });
    const [error, setError] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [movementData, setMovementData] = useState(null); // État pour stocker le mouvement après succès

    useEffect(() => {
        if (show) {
            loadData();
            setSupplyData({ fournisseurId: '', items: [], imageJustificatif: '' });
            setNewItem({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', datePeremption: '', categorie: 'Divers' });
            setError('');
            setMovementData(null);
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

    const handleAddCategory = () => {
        const newCat = prompt("Entrez le nom de la nouvelle catégorie :");
        if (newCat && newCat.trim() !== '') {
            const trimmedCat = newCat.trim();
            // Ajout à la liste locale si elle n'existe pas déjà
            setCustomCategories(prev => prev.includes(trimmedCat) ? prev : [...prev, trimmedCat]);
            // Sélection automatique pour l'article en cours
            setNewItem(prev => ({ ...prev, categorie: trimmedCat }));
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

    const handleGlobalJustificatifChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSupplyData({ ...supplyData, imageJustificatif: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleProductSelect = (productName) => {
        const art = articles.find(a => a.nom.toLowerCase() === productName.toLowerCase());
        if (art) {
            setNewItem({
                ...newItem,
                nom: productName,
                prixAchat: art.prixAchat || 0,
                prixVente: art.prixVente || 0,
                code: art.code || '',
                image: art.image || '',
                datePeremption: art.datePeremption ? art.datePeremption.split('T')[0] : '',
                categorie: art.categorie || 'Divers'
            });
        } else {
            setNewItem(prev => ({ ...prev, nom: productName }));
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
                        categorie: newItem.categorie // On met à jour la catégorie si elle a été changée
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

        // On vide le formulaire mais on GARDE la catégorie actuelle pour l'article suivant
        setNewItem(prev => ({ 
            nom: '', quantite: 10, prixAchat: 0, prixVente: 0, 
            image: '', code: '', datePeremption: '', categorie: prev.categorie 
        }));
    };

    const removeItemFromSupply = (index) => {
        const newItems = [...supplyData.items];
        newItems.splice(index, 1);
        setSupplyData({ ...supplyData, items: newItems });
    };

    // Fonction locale pour générer le Bon d'Entrée avec les colonnes demandées
    const handleGeneratePDF = (mvt, action = 'download') => {
        const doc = new jsPDF();
        const formatCurrency = (val) => (val || 0).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' GNF';

        // --- En-tête ---
        try {
            doc.addImage(logo, 'PNG', 14, 10, 40, 15);
        } catch (e) { console.error(e); }

        doc.setFontSize(18).setTextColor(41, 128, 185).setFont("helvetica", "bold");
        doc.text("BON D'ENTRÉE EN STOCK", 105, 20, { align: 'center' });

        doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
        doc.text(`N° Bon : #BE-${mvt._id.toString().slice(-6).toUpperCase()}`, 105, 27, { align: 'center' });
        doc.text(`Date : ${new Date(mvt.createdAt).toLocaleString('fr-FR')}`, 196, 20, { align: 'right' });

        // --- Tableau des produits ---
        const tableColumn = ["Désignation", "Qté", "P. Achat", "P. Vente", "Total (Achat)"];
        const tableRows = mvt.articles.map(a => [
            a.nomArticle,
            a.quantite,
            formatCurrency(a.prixAchatUnitaire),
            formatCurrency(a.prixVenteUnitaire),
            formatCurrency(a.quantite * a.prixAchatUnitaire)
        ]);

        // Calcul du grand total
        const totalGlobal = mvt.articles.reduce((sum, a) => sum + (a.quantite * (a.prixAchatUnitaire || 0)), 0);
        tableRows.push([
            { content: 'VALEUR TOTALE DU BON D\'ENTRÉE', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
            { content: formatCurrency(totalGlobal), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
        ]);

        autoTable(doc, {
            startY: 40,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], halign: 'center' },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' }
            }
        });

        // --- Pied de page : Signatures (Inspiré d'Odoo) ---
        let finalY = doc.lastAutoTable.finalY + 15;
        
        // Sécurité : Si le tableau finit trop bas, on ajoute une page pour les signatures
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(11).setTextColor(0).setFont("helvetica", "bold");
        doc.text("LE FOURNISSEUR (VISA)", 14, finalY);
        doc.text("LE RÉCEPTIONNAIRE (DÉPÔT)", 105, finalY);
        
        doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(80);
        doc.text(mvt.fournisseur?.nom || 'N/A', 14, finalY + 7);
        doc.text(mvt.boutiqueDestination?.nom || 'Dépôt Principal', 105, finalY + 7);
        
        doc.setFontSize(9).setTextColor(150);
        doc.text("Précédé de la mention 'Bon pour livraison'", 14, finalY + 15);
        doc.text("Précédé de la mention 'Vérifié et Accepté'", 105, finalY + 15);

        // Lignes de signature pour le cachet
        doc.setDrawColor(200).line(14, finalY + 35, 70, finalY + 35);
        doc.line(105, finalY + 35, 160, finalY + 35);

        if (action === 'preview') {
            window.open(doc.output('bloburl'), '_blank');
        } else {
            doc.save(`bon_entree_${mvt._id.toString().slice(-6)}.pdf`);
        }
    };

    const submitSupply = async () => {
        if (!supplyData.fournisseurId) {
            setError("Veuillez sélectionner un fournisseur.");
            return;
        }
        setSubmitLoading(true);
        setError('');
        try {
            const res = await fournisseurAPI.approvisionner(supplyData);
            if (res.data.movement) { // Le backend renvoie le mouvement peuplé
                setMovementData(res.data.movement);
            } else {
                onSuccess("Approvisionnement réussi !");
                onHide();
            }
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
                    <Modal.Title>{movementData ? 'Opération Réussie' : 'Approvisionner le Dépôt Principal'}</Modal.Title>
                </Modal.Header>
                {movementData ? (
                    <Modal.Body className="text-center py-5">
                        <div className="mb-3 text-success">
                            <iconify-icon icon="solar:check-circle-bold-duotone" style={{ fontSize: '72px' }}></iconify-icon>
                        </div>
                        <h4 className="fw-bold mb-3">Approvisionnement enregistré avec succès !</h4>
                        <p className="text-muted mb-4">L'inventaire du dépôt principal a été mis à jour. Souhaitez-vous consulter le Bon d'Entrée ?</p>
                        
                        <div className="d-flex justify-content-center gap-3">
                            <Button variant="outline-primary" className="rounded-pill px-4 py-2 d-flex align-items-center fw-bold" onClick={() => handleGeneratePDF(movementData, 'preview')}>
                                <iconify-icon icon="solar:eye-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                                Aperçu du Bon
                            </Button>
                            <Button variant="primary" className="rounded-pill px-4 py-2 d-flex align-items-center fw-bold shadow-sm" onClick={() => handleGeneratePDF(movementData, 'download')}>
                                <iconify-icon icon="solar:download-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                                Télécharger (PDF)
                            </Button>
                        </div>
                    </Modal.Body>
                ) : (
                    <Modal.Body>
                        {error && <Alert variant="danger">{error}</Alert>}

                        <Card className="border-0 bg-light rounded-4 mb-4 shadow-sm">
                            <Card.Body>
                                <Row className="g-3">
                                    <Col md={4}>
                                        <Form.Label className="fw-bold small text-uppercase text-muted">Fournisseur</Form.Label>
                                        <Form.Select 
                                            value={supplyData.fournisseurId}
                                            onChange={(e) => setSupplyData({ ...supplyData, fournisseurId: e.target.value, items: [] })}
                                            className="rounded-pill border-0 shadow-sm"
                                        >
                                            <option value="">Sélectionner...</option>
                                            {fournisseurs.map(f => <option key={f._id} value={f._id}>{f.nom}</option>)}
                                        </Form.Select>
                                    </Col>
                                    <Col md={4}>
                                        <Form.Label className="fw-bold small text-uppercase text-muted">Réf. Bon de Livraison (BL)</Form.Label>
                                        <Form.Control 
                                            type="text" 
                                            placeholder="Ex: BL-2024-001" 
                                            value={supplyData.referenceFournisseur} 
                                            onChange={e => setSupplyData({...supplyData, referenceFournisseur: e.target.value})}
                                            className="rounded-pill border-0 shadow-sm"
                                        />
                                    </Col>
                                    <Col md={4}>
                                        <Form.Label className="fw-bold small text-uppercase text-muted">Date Réception</Form.Label>
                                        <Form.Control 
                                            type="date" 
                                            value={supplyData.dateReception} 
                                            onChange={e => setSupplyData({...supplyData, dateReception: e.target.value})}
                                            className="rounded-pill border-0 shadow-sm"
                                        />
                                    </Col>
                                </Row>
                            </Card.Body>
                        </Card>

                        {supplyData.fournisseurId && (
                            <Form.Group className="mb-4">
                                <Form.Label className="fw-bold text-primary">
                                    <iconify-icon icon="solar:camera-bold" className="me-1"></iconify-icon> Photo du Bon de Livraison (Justificatif)
                                </Form.Label>
                                <Form.Control 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    onChange={handleGlobalJustificatifChange} 
                                    className="bg-light rounded-pill shadow-sm"
                                />
                                {supplyData.imageJustificatif && (
                                    <div className="mt-2 text-center">
                                        <img src={supplyData.imageJustificatif} alt="Justificatif" className="img-fluid rounded-4 shadow-sm border" style={{maxHeight: '120px'}} />
                                        <Button variant="link" size="sm" className="text-danger d-block mx-auto mt-1" onClick={() => setSupplyData({...supplyData, imageJustificatif: ''})}>Retirer la photo</Button>
                                    </div>
                                )}
                            </Form.Group>
                        )}

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
                                        <Form.Label>Catégorie</Form.Label>
                                        <InputGroup>
                                            <Form.Select 
                                                value={newItem.categorie} 
                                                onChange={e => setNewItem({...newItem, categorie: e.target.value})}
                                            >
                                                {[...new Set(['Divers', 'Fast food', 'Restauration', 'Boulangerie', 'Boucherie', 'Habillement', ...articles.map(a => a.categorie).filter(Boolean), ...customCategories])].sort().map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </Form.Select>
                                            <Button 
                                                variant="outline-primary" 
                                                onClick={handleAddCategory}
                                                title="Ajouter une nouvelle catégorie"
                                            >
                                                <iconify-icon icon="solar:add-circle-bold" style={{ verticalAlign: 'middle' }}></iconify-icon>
                                            </Button>
                                        </InputGroup>
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
                                    <th>Article</th><th>Catégorie</th><th>Qté</th><th>P. Achat</th><th>P. Vente</th><th>Total</th><th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {supplyData.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.nom}</td>
                                        <td className="text-center"><Badge bg="info" pill>{item.categorie || 'Divers'}</Badge></td>
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
                )}
                <Modal.Footer>
                    {movementData ? (
                        <Button variant="secondary" className="rounded-pill px-4 fw-bold" onClick={() => { onSuccess("Approvisionnement terminé"); onHide(); }}>
                            Terminer
                        </Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={onHide} disabled={submitLoading}>Annuler</Button>
                            <Button variant="success" onClick={submitSupply} disabled={supplyData.items.length === 0 || submitLoading}>
                                {submitLoading ? <Spinner as="span" size="sm" /> : 'Valider l\'Approvisionnement'}
                            </Button>
                        </>
                    )}
                </Modal.Footer>
            </Modal>
    );
};

export default SupplyModal;
