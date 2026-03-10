// src/components/StockStatusView.js
// Composant d'affichage de l'état du stock
// Permet de visualiser le stock par boutique et par article
// Affiche les alertes de stock faible et les mouvements récents
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Table, Badge, Form, Row, Col, Button, Modal } from 'react-bootstrap';
import { articleAPI, boutiqueAPI, fournisseurAPI } from '../services/api';
import IntelligentSupplyModal from './common/IntelligentSupplyModal';

const formatCurrency = (value) => {
    if (typeof value !== 'number') return '...';
    // Remplace les espaces insécables par des espaces normaux pour le support PDF
    return (value.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

const StockStatusView = () => {
    const [articlesByBoutique, setArticlesByBoutique] = useState({});
    const [allArticles, setAllArticles] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]);
    const [centralShopId, setCentralShopId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Filtres
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'rupture', 'reapprovisionnement', 'en-stock'
    const [filterBoutique, setFilterBoutique] = useState('all'); // 'all' or boutique._id
    const [filterFournisseur, setFilterFournisseur] = useState('all');

    // Sélection et Modales
    const [selectedArticles, setSelectedArticles] = useState([]);
    const [preSelectedSupplier, setPreSelectedSupplier] = useState('');
    const [showSupplyModal, setShowSupplyModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferItems, setTransferItems] = useState([]);
    const [transferLoading, setTransferLoading] = useState(false);

    const fetchData = useCallback(async () => {
            try {
                setLoading(true);
                const [articlesRes, boutiquesRes, fournisseursRes] = await Promise.all([
                    articleAPI.getAll(),
                    boutiqueAPI.getAll(),
                    fournisseurAPI.getAll()
                ]);

                const articles = articlesRes.data;
                const allBoutiques = boutiquesRes.data.sort((a, b) => a.nom.localeCompare(b.nom));
                const allFournisseurs = fournisseursRes.data;

                const centrale = allBoutiques.find(b => b.type === 'Centrale');
                if (centrale) setCentralShopId(centrale._id);

                // Group articles by boutique
                const groupedArticles = articles.reduce((acc, article) => {
                    const boutiqueId = article.boutique?._id || 'unassigned';
                    if (!acc[boutiqueId]) {
                        acc[boutiqueId] = [];
                    }
                    acc[boutiqueId].push(article);
                    return acc;
                }, {});

                setAllArticles(articles);
                setArticlesByBoutique(groupedArticles);
                setBoutiques(allBoutiques);
                setFournisseurs(allFournisseurs);

            } catch (err) {
                setError(err.response?.data?.message || "Erreur lors du chargement de l'état des stocks.");
            } finally {
                setLoading(false);
            }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setSelectedArticles([]);
    }, [filterBoutique, filterFournisseur]);

    const filterArticlesByStatus = (articles) => {
        if (filterStatus === 'all') return articles;
        
        return articles.filter(article => {
            const status = getStatusBadge(article.quantite).props.children;
            if (filterStatus === 'rupture') return status === 'Rupture de Stock';
            if (filterStatus === 'reapprovisionnement') return status === 'Réapprovisionnement';
            if (filterStatus === 'en-stock') return status === 'En Stock';
            return true;
        });
    };

    const getStatusBadge = (quantite, seuil = 10) => {
        if (quantite <= 0) {
            return <Badge bg="danger">Rupture de Stock</Badge>;
        }
        if (quantite <= seuil) {
            return <Badge bg="warning" text="dark">Réapprovisionnement</Badge>;
        }
        return <Badge bg="success">En Stock</Badge>;
    };

    const handleSelectAll = (articles) => {
        if (selectedArticles.length === articles.length) {
            setSelectedArticles([]);
        } else {
            setSelectedArticles(articles.map(a => a._id));
        }
    };

    const handleSelectOne = (articleId) => {
        if (selectedArticles.includes(articleId)) {
            setSelectedArticles(selectedArticles.filter(id => id !== articleId));
        } else {
            setSelectedArticles([...selectedArticles, articleId]);
        }
    };

    const handleOpenTransferModal = () => {
        const itemsToTransfer = selectedArticles.map(id => {
            const article = allArticles.find(a => a._id === id);
            const centralArticle = allArticles.find(a => a.boutique?._id === centralShopId && a.nom === article.nom);
            return {
                ...article,
                quantiteToTransfer: 10, // Default quantity
                stockCentral: centralArticle ? centralArticle.quantite : 0,
            };
        });
        setTransferItems(itemsToTransfer);
        setShowTransferModal(true);
    };

    const handleTransferItemChange = (id, newQuantity) => {
        setTransferItems(prev => prev.map(item => 
            item._id === id ? { ...item, quantiteToTransfer: parseInt(newQuantity) || 0 } : item
        ));
    };

    const handleConfirmTransfer = async () => {
        setTransferLoading(true);
        setError('');

        const articlesPayload = transferItems
            .filter(item => item.quantiteToTransfer > 0 && item.quantiteToTransfer <= item.stockCentral)
            .map(item => ({
                articleId: item._id, // ID of the article in the secondary shop
                quantite: item.quantiteToTransfer
            }));
        
        if (articlesPayload.length === 0) {
            setError("Aucun article avec une quantité valide à transférer.");
            setTransferLoading(false);
            return;
        }

        try {
            const res = await articleAPI.restock({ targetId: filterBoutique, articles: articlesPayload });
            setSuccess(res.data.message);
            setShowTransferModal(false);
            fetchData(); // Refresh data
            setSelectedArticles([]);
            setTimeout(() => setSuccess(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du transfert.");
        } finally {
            setTransferLoading(false);
        }
    };

    const handleSupplySuccess = () => {
        setSuccess("Approvisionnement réussi !");
        setShowSupplyModal(false);
        fetchData();
        setSelectedArticles([]);
        setTimeout(() => setSuccess(''), 4000);
    };

    const handleOpenSupplyModal = () => {
        const articlesForSupply = allArticles.filter(a => selectedArticles.includes(a._id));
        const uniqueSuppliers = [...new Set(articlesForSupply.map(a => a.fournisseur?._id).filter(Boolean))];
        if (uniqueSuppliers.length === 1) {
            setPreSelectedSupplier(uniqueSuppliers[0]);
        } else {
            setPreSelectedSupplier(''); // Reset if multiple or no suppliers
        }
        setShowSupplyModal(true);
    };

    if (loading) return <div className="p-4 text-center"><Spinner animation="border" /></div>;
    if (error) return <div className="p-4"><Alert variant="danger">{error}</Alert></div>;

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">État des Stocks par Boutique</h3>
                {success && <Alert variant="success" className="mb-0 py-2 flex-shrink-0">{success}</Alert>}
            </div>

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3 align-items-end">
                        <Col md={filterBoutique === centralShopId ? 4 : 6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold">Filtrer par boutique</Form.Label>
                                <Form.Select value={filterBoutique} onChange={e => {
                                    const newBoutiqueFilter = e.target.value;
                                    setFilterBoutique(newBoutiqueFilter);
                                    // Si on sélectionne une boutique autre que la centrale, on réinitialise le filtre fournisseur.
                                    if (newBoutiqueFilter !== centralShopId) {
                                        setFilterFournisseur('all');
                                    }
                                }}>
                                    <option value="all">Toutes les boutiques</option>
                                    {boutiques.map(boutique => <option key={boutique._id} value={boutique._id}>{boutique.nom}</option>)}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                        {/* Le filtre par fournisseur n'est visible que si la boutique centrale est sélectionnée */}
                        {filterBoutique === centralShopId && (
                            <Col md={4}>
                                <Form.Group>
                                    <Form.Label className="small fw-bold">Filtrer par fournisseur</Form.Label>
                                    <Form.Select 
                                        value={filterFournisseur} 
                                        onChange={e => setFilterFournisseur(e.target.value)}
                                    >
                                        <option value="all">Tous les fournisseurs</option>
                                        {fournisseurs.map(f => <option key={f._id} value={f._id}>{f.nom}</option>)}
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                        )}
                        <Col md={filterBoutique === centralShopId ? 4 : 6}>
                            <Form.Group>
                                <Form.Label className="small fw-bold">Filtrer par état du stock</Form.Label>
                                <Form.Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                    <option value="all">Tous les états</option>
                                    <option value="rupture">Rupture de Stock</option>
                                    <option value="reapprovisionnement">Réapprovisionnement</option>
                                    <option value="en-stock">En Stock</option>
                                </Form.Select>
                            </Form.Group>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {boutiques
                .filter(boutique => filterBoutique === 'all' || boutique._id === filterBoutique)
                .map(boutique => {
                    const boutiqueArticles = articlesByBoutique[boutique._id] || [];
                    const totalStockValue = boutiqueArticles.reduce((sum, article) => sum + (article.quantite * article.prixAchat), 0);
                    const isSingleView = filterBoutique !== 'all';
                    const isCentral = boutique.type === 'Centrale';
                    let filteredBoutiqueArticles = filterArticlesByStatus(boutiqueArticles);
                    // Le filtre par fournisseur ne s'applique que sur la boutique centrale
                    if (filterFournisseur !== 'all' && boutique._id === centralShopId) {
                        filteredBoutiqueArticles = filteredBoutiqueArticles.filter(a => a.fournisseur?._id === filterFournisseur);
                    }

                    const columnCount = (isSingleView ? 1 : 0) + 11 + (isCentral ? 1 : 0);

                    return (
                        <Card key={boutique._id} className="border-0 shadow-sm rounded-4 mb-4">
                        <Card.Header className="bg-body py-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
                            <div>
                                <h5 className="fw-bold mb-0">{boutique.nom} {boutique.type === 'Centrale' && <Badge bg="primary" pill>Dépôt Principal</Badge>}</h5>
                                <Badge bg="primary-subtle" text="primary-emphasis" className="p-2 fs-6 mt-1">
                                    Valeur totale: {formatCurrency(totalStockValue)}
                                </Badge>
                            </div>
                            {isSingleView && selectedArticles.length > 0 && (
                                <div>
                                    {boutique.type === 'Centrale' ? (
                                        <Button variant="success" onClick={handleOpenSupplyModal}>
                                            <iconify-icon icon="solar:box-up-bold" className="me-2"></iconify-icon>
                                            Approvisionner ({selectedArticles.length})
                                        </Button>
                                    ) : (
                                        <Button variant="primary" onClick={handleOpenTransferModal}>
                                            <iconify-icon icon="solar:box-minimalistic-bold" className="me-2"></iconify-icon>
                                            Réapprovisionner ({selectedArticles.length})
                                        </Button>
                                    )}
                                </div>
                            )}
                        </Card.Header>
                        <Card.Body className="p-0">
                            <Table responsive hover className="align-middle mb-0">
                                <thead className="bg-body-tertiary">
                                    <tr>
                                        {isSingleView && (
                                            <th className="ps-4 border-0">
                                                <Form.Check 
                                                    type="checkbox"
                                                    checked={filteredBoutiqueArticles.length > 0 && selectedArticles.length === filteredBoutiqueArticles.length}
                                                    onChange={() => handleSelectAll(filteredBoutiqueArticles)}
                                                />
                                            </th>
                                        )}
                                        <th className="ps-4 border-0 text-muted small text-uppercase">Img</th>
                                        <th className="ps-4 border-0 text-muted small text-uppercase">Code</th>
                                        <th className="ps-4 border-0 text-muted small text-uppercase">Produit</th>
                                        {isCentral && <th className="ps-4 border-0 text-muted small text-uppercase">Fournisseur</th>}
                                        <th className="text-center border-0 text-muted small text-uppercase">unite Disponible</th>
                                        <th className="text-end border-0 text-muted small text-uppercase">Prix d'Achat</th>
                                        <th className="text-end border-0 text-muted small text-uppercase">Prix de Vente</th>
                                        <th className="text-end border-0 text-muted small text-uppercase">Marge Unitaire</th>
                                        <th className="text-end border-0 text-muted small text-uppercase">Marge (%)</th>
                                        <th className="text-end border-0 text-muted small text-uppercase">Valeur Stock</th>
                                        <th className="text-center border-0 text-muted small text-uppercase">Seuil d'Alerte</th>
                                        <th className="text-center pe-4 border-0 text-muted small text-uppercase">Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {boutiqueArticles.length > 0 ? filteredBoutiqueArticles.map(article => {
                                        const margeUnitaire = article.prixVente - article.prixAchat;
                                        const margePourcentage = article.prixVente > 0 ? (margeUnitaire / article.prixVente) * 100 : 0;

                                        return (
                                            <tr key={article._id}>
                                                {isSingleView && (
                                                    <td className="ps-4">
                                                        <Form.Check 
                                                            type="checkbox"
                                                            checked={selectedArticles.includes(article._id)}
                                                            onChange={() => handleSelectOne(article._id)}
                                                        />
                                                    </td>
                                                )}
                                                <td className="ps-4">{article.image ? <img src={article.image} alt="" className="rounded shadow-sm" style={{width: '35px', height: '35px', objectFit: 'cover'}} /> : <span className="text-muted small">-</span>}</td>
                                                <td className="ps-4 text-muted small">{article.code || '-'}</td>
                                                <td className="ps-4 fw-bold">{article.nom}</td>
                                                {isCentral && <td className="ps-4">{article.fournisseur?.nom || <Badge bg="secondary">Non spécifié</Badge>}</td>}
                                                <td className="text-center">{article.quantite}</td>
                                                <td className="text-end text-danger">{formatCurrency(article.prixAchat)}</td>
                                                <td className="text-end text-success">{formatCurrency(article.prixVente)}</td>
                                                <td className="text-end text-primary fw-bold">{formatCurrency(margeUnitaire)}</td>
                                                <td className="text-end text-primary">{margePourcentage.toFixed(1)}%</td>
                                                <td className="text-end fw-bold">{formatCurrency(article.quantite * article.prixAchat)}</td>
                                                <td className="text-center text-muted">10</td>
                                                <td className="text-center pe-4">{getStatusBadge(article.quantite)}</td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={columnCount} className="text-center text-muted p-4">Aucun article dans cette boutique.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                        </Card>
                    );
                })}

            {(!boutiques || boutiques.length === 0) && (
                <Alert variant="info">Aucune boutique n'a été configurée.</Alert>
            )}

            {/* Modales */}
            <IntelligentSupplyModal
                show={showSupplyModal}
                onHide={() => setShowSupplyModal(false)}
                onSuccess={handleSupplySuccess}
                articlesToSupply={allArticles.filter(a => selectedArticles.includes(a._id))}
                preSelectedFournisseurId={preSelectedSupplier}
            />

            <Modal show={showTransferModal} onHide={() => setShowTransferModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Réapprovisionner la boutique</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Alert variant="info" className="small">
                        Transfert depuis le <strong>Dépôt Principal</strong> vers <strong>{boutiques.find(b => b._id === filterBoutique)?.nom}</strong>.
                    </Alert>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Table striped hover>
                        <thead>
                            <tr>
                                <th>Article</th>
                                <th className="text-center">Stock Central</th>
                                <th style={{ width: '150px' }}>Quantité à transférer</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transferItems.map(item => (
                                <tr key={item._id}>
                                    <td className="align-middle">{item.nom}</td>
                                    <td className="align-middle text-center">
                                        <Badge bg={item.stockCentral > 0 ? 'success' : 'danger'}>{item.stockCentral}</Badge>
                                    </td>
                                    <td>
                                        <Form.Control
                                            type="number"
                                            min="0"
                                            max={item.stockCentral}
                                            value={item.quantiteToTransfer}
                                            onChange={(e) => handleTransferItemChange(item._id, e.target.value)}
                                            isInvalid={item.quantiteToTransfer > item.stockCentral}
                                            disabled={item.stockCentral === 0}
                                        />
                                        <Form.Control.Feedback type="invalid">
                                            Stock insuffisant
                                        </Form.Control.Feedback>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Annuler</Button>
                    <Button variant="primary" onClick={handleConfirmTransfer} disabled={transferLoading}>
                        {transferLoading ? <Spinner size="sm" /> : 'Valider le transfert'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default StockStatusView;