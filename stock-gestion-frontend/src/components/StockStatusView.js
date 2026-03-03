// src/components/StockStatusView.js
// Composant d'affichage de l'état du stock
// Permet de visualiser le stock par boutique et par article
// Affiche les alertes de stock faible et les mouvements récents
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect } from 'react';
import { Card, Spinner, Alert, Table, Badge } from 'react-bootstrap';
import { articleAPI, boutiqueAPI } from '../services/api';

const formatCurrency = (value) => {
    if (typeof value !== 'number') return '...';
    // Remplace les espaces insécables par des espaces normaux pour le support PDF
    return (value.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

const StockStatusView = () => {
    const [articlesByBoutique, setArticlesByBoutique] = useState({});
    const [boutiques, setBoutiques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [articlesRes, boutiquesRes] = await Promise.all([
                    articleAPI.getAll(),
                    boutiqueAPI.getAll()
                ]);

                const articles = articlesRes.data;
                const allBoutiques = boutiquesRes.data.sort((a, b) => a.nom.localeCompare(b.nom));

                // Group articles by boutique
                const groupedArticles = articles.reduce((acc, article) => {
                    const boutiqueId = article.boutique?._id || 'unassigned';
                    if (!acc[boutiqueId]) {
                        acc[boutiqueId] = [];
                    }
                    acc[boutiqueId].push(article);
                    return acc;
                }, {});

                setArticlesByBoutique(groupedArticles);
                setBoutiques(allBoutiques);

            } catch (err) {
                setError(err.response?.data?.message || "Erreur lors du chargement de l'état des stocks.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const getStatusBadge = (quantite, seuil = 10) => {
        if (quantite <= 0) {
            return <Badge bg="danger">Rupture de Stock</Badge>;
        }
        if (quantite <= seuil) {
            return <Badge bg="warning" text="dark">Réapprovisionnement</Badge>;
        }
        return <Badge bg="success">En Stock</Badge>;
    };

    if (loading) return <div className="p-4 text-center"><Spinner animation="border" /></div>;
    if (error) return <div className="p-4"><Alert variant="danger">{error}</Alert></div>;

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold mb-0">État des Stocks par Boutique</h3>
            </div>

            {boutiques.map(boutique => {
                const articles = articlesByBoutique[boutique._id] || [];
                const totalStockValue = articles.reduce((sum, article) => sum + (article.quantite * article.prixAchat), 0);

                return (
                    <Card key={boutique._id} className="border-0 shadow-sm rounded-4 mb-4">
                        <Card.Header className="bg-body py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <h5 className="fw-bold mb-0">{boutique.nom} {boutique.type === 'Centrale' && <Badge bg="primary" pill>Dépôt Principal</Badge>}</h5>
                            <Badge bg="primary-subtle" text="primary-emphasis" className="p-2 fs-6">
                                Valeur totale: {formatCurrency(totalStockValue)}
                            </Badge>
                        </Card.Header>
                        <Card.Body className="p-0">
                            <Table responsive hover className="align-middle mb-0">
                                <thead className="bg-body-tertiary">
                                    <tr>
                                        <th className="ps-4 border-0 text-muted small text-uppercase">Img</th>
                                        <th className="ps-4 border-0 text-muted small text-uppercase">Code</th>
                                        <th className="ps-4 border-0 text-muted small text-uppercase">Produit</th>
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
                                    {articles.length > 0 ? articles.map(article => {
                                        const margeUnitaire = article.prixVente - article.prixAchat;
                                        const margePourcentage = article.prixVente > 0 ? (margeUnitaire / article.prixVente) * 100 : 0;

                                        return (
                                            <tr key={article._id}>
                                                <td className="ps-4">{article.image ? <img src={article.image} alt="" className="rounded shadow-sm" style={{width: '35px', height: '35px', objectFit: 'cover'}} /> : <span className="text-muted small">-</span>}</td>
                                                <td className="ps-4 text-muted small">{article.code || '-'}</td>
                                                <td className="ps-4 fw-bold">{article.nom}</td>
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
                                            <td colSpan="11" className="text-center text-muted p-4">Aucun article dans cette boutique.</td>
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
        </div>
    );
};

export default StockStatusView;