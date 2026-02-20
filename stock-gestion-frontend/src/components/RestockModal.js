import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { boutiqueAPI, articleAPI } from '../services/api';

const RestockModal = ({ show, onHide, onSuccess }) => {
    const [boutiques, setBoutiques] = useState([]);
    const [centralShop, setCentralShop] = useState(null);
    const [restockTargetId, setRestockTargetId] = useState('');
    const [centralShopArticles, setCentralShopArticles] = useState([]);
    const [selectedRestockArticles, setSelectedRestockArticles] = useState([]);
    const [restockQuantities, setRestockQuantities] = useState({});
    const [loading, setLoading] = useState(true);
    const [restockLoading, setRestockLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const fetchData = useCallback(async () => {
        if (!show) return;
        setLoading(true);
        try {
            const boutiquesRes = await boutiqueAPI.getAll();
            const centrale = boutiquesRes.data.find(b => b.type === 'Centrale');
            setBoutiques(boutiquesRes.data);
            setCentralShop(centrale);

            if (centrale) {
                const articlesRes = await articleAPI.getAll();
                const shopArticles = articlesRes.data.filter(a => (a.boutique?._id || a.boutique) === centrale._id);
                setCentralShopArticles(shopArticles);
            }
        } catch (err) {
            setMessage({ type: 'danger', text: "Erreur de chargement des données initiales." });
        } finally {
            setLoading(false);
        }
    }, [show]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRestockSubmit = async (e) => {
        e.preventDefault();
        setRestockLoading(true);
        setMessage({ type: '', text: '' });

        if (!restockTargetId) {
            setRestockLoading(false);
            return setMessage({ type: 'warning', text: "Veuillez sélectionner une boutique de destination." });
        }
        if (selectedRestockArticles.length === 0) {
            setRestockLoading(false);
            return setMessage({ type: 'warning', text: "Veuillez sélectionner au moins un article à réapprovisionner." });
        }

        const articlesPayload = selectedRestockArticles.map(id => ({
            articleId: id,
            quantite: restockQuantities[id] || centralShopArticles.find(a => a._id === id)?.quantite || 1
        }));

        try {
            const res = await articleAPI.restock({ targetId: restockTargetId, articles: articlesPayload });
            onSuccess(res.data.message);
            handleClose();
        } catch (err) {
            setMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du réapprovisionnement." });
        } finally {
            setRestockLoading(false);
        }
    };

    const handleClose = () => {
        setRestockTargetId('');
        setSelectedRestockArticles([]);
        setRestockQuantities({});
        setMessage({ type: '', text: '' });
        onHide();
    };

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Réapprovisionner une Boutique</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleRestockSubmit}>
                <Modal.Body>
                    <Alert variant="info" className="small">
                        Transférez des articles depuis la Boutique Centrale vers une boutique secondaire.
                    </Alert>
                    {message.text && <Alert variant={message.type}>{message.text}</Alert>}
                    
                    <Form.Group className="mb-3">
                        <Form.Label>Depuis la boutique (Source)</Form.Label>
                        <Form.Control 
                            type="text"
                            value={centralShop?.nom || 'Boutique Centrale non trouvée'}
                            disabled
                        />
                    </Form.Group>

                    {centralShop && (
                        <Form.Group className="mb-3">
                            <Form.Label>Sélectionner les articles à transférer</Form.Label>
                            {loading ? <div className="text-center"><Spinner size="sm" /></div> : (
                                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dee2e6', padding: '10px', borderRadius: '4px' }}>
                                    {centralShopArticles.length > 0 ? (
                                        <>
                                        <Form.Check 
                                            type="checkbox"
                                            label="Tout sélectionner"
                                            checked={selectedRestockArticles.length === centralShopArticles.length && centralShopArticles.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedRestockArticles(centralShopArticles.map(a => a._id));
                                                else {
                                                    setSelectedRestockArticles([]);
                                                    setRestockQuantities({});
                                                }
                                            }}
                                            className="mb-2 fw-bold text-primary"
                                        />
                                        {centralShopArticles.map(article => (
                                            <div key={article._id} className="d-flex align-items-center justify-content-between mb-2 border-bottom pb-1">
                                                <Form.Check 
                                                    type="checkbox"
                                                    label={`${article.nom} (Dispo: ${article.quantite})`}
                                                    checked={selectedRestockArticles.includes(article._id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedRestockArticles([...selectedRestockArticles, article._id]);
                                                            setRestockQuantities(prev => ({...prev, [article._id]: article.quantite}));
                                                        } else {
                                                            setSelectedRestockArticles(selectedRestockArticles.filter(id => id !== article._id));
                                                        }
                                                    }}
                                                    className="flex-grow-1"
                                                />
                                                {selectedRestockArticles.includes(article._id) && (
                                                    <Form.Control 
                                                        type="number" 
                                                        min="1" 
                                                        max={article.quantite}
                                                        value={restockQuantities[article._id] !== undefined ? restockQuantities[article._id] : article.quantite}
                                                        onChange={(e) => setRestockQuantities({...restockQuantities, [article._id]: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                                        style={{ width: '80px' }}
                                                        size="sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        </>
                                    ) : <p className="text-muted small mb-0">Aucun article dans la boutique centrale.</p>}
                                </div>
                            )}
                        </Form.Group>
                    )}

                    <Form.Group className="mb-3">
                        <Form.Label>Vers la boutique (Destination)</Form.Label>
                        <Form.Select 
                            value={restockTargetId}
                            onChange={(e) => setRestockTargetId(e.target.value)}
                            required
                        >
                            <option value="">Sélectionner une boutique secondaire...</option>
                            {boutiques.filter(b => b.type !== 'Centrale').map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
                        </Form.Select>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Fermer</Button>
                    <Button variant="success" type="submit" disabled={restockLoading || loading}>
                        {restockLoading ? <Spinner as="span" animation="border" size="sm" /> : 'Réapprovisionner'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default RestockModal;