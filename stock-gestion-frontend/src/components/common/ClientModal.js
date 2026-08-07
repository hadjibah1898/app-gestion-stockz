/**
 * @file ClientModal.js
 * @description Composant React.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Row, Col, Spinner } from 'react-bootstrap';
import { clientAPI } from '../../services/api';

const ClientModal = ({ show, onHide, clientToEdit, onSuccess }) => {
    const [currentClient, setCurrentClient] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [modalError, setModalError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (show) {
            setModalError('');
            if (clientToEdit) {
                setCurrentClient(clientToEdit);
                setEditMode(true);
            } else {
// Default for new client
                setCurrentClient({ nom: '', email: '', telephone: '', type: 'Client', adresse: '', quartier: '', ville: '', tauxCommission: 0 });
                setEditMode(false);
            }
        }
    }, [show, clientToEdit]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setCurrentClient(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setModalError('');
        setLoading(true);
        
        try {
            let response;
            if (editMode) {
                response = await clientAPI.update(currentClient._id, currentClient);
            } else {
                response = await clientAPI.create(currentClient);
            }
            onSuccess(response.data, editMode); // Pass the saved client data and mode back
        } catch (err) {
            setModalError(err.response?.data?.message || "Erreur d'enregistrement");
        } finally {
            setLoading(false);
        }
    };

    if (!currentClient) return null; // Ne rien rendre si le client n'est pas prêt

    return (
        <Modal show={show} onHide={onHide}>
            <Modal.Header closeButton>
                <Modal.Title>{editMode ? 'Modifier le Client' : 'Nouveau Client / Ouvrier'}</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    {modalError && <Alert variant="danger">{modalError}</Alert>}
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Nom complet</Form.Label>
                                <Form.Control type="text" name="nom" value={currentClient.nom} onChange={handleChange} required />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Téléphone</Form.Label>
                                <Form.Control type="text" name="telephone" value={currentClient.telephone} onChange={handleChange} />
                            </Form.Group>
                        </Col>
                    </Row>
                    <Form.Group className="mb-3">
                        <Form.Label>Email</Form.Label>
                        <Form.Control type="email" name="email" value={currentClient.email} onChange={handleChange} placeholder="client@exemple.com" />
                    </Form.Group>
<Form.Group className="mb-3">
                        <Form.Label>Adresse</Form.Label>
                        <Form.Control type="text" name="adresse" value={currentClient.adresse} onChange={handleChange} />
                    </Form.Group>
                    <Row>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Quartier</Form.Label>
                                <Form.Control type="text" name="quartier" value={currentClient.quartier} onChange={handleChange} placeholder="Ex: Madina" />
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label>Ville</Form.Label>
                                <Form.Control type="text" name="ville" value={currentClient.ville} onChange={handleChange} placeholder="Ex: Conakry" />
                            </Form.Group>
                        </Col>
                    </Row>
                    <Form.Group className="mb-3">
                        <Form.Label>Type</Form.Label>
                        <Form.Select name="type" value={currentClient.type} onChange={handleChange}>
                            <option value="Client">Client Standard</option>
                            <option value="Ouvrier">Ouvrier / Apporteur d'affaires</option>
                        </Form.Select>
                    </Form.Group>
                    
                    {currentClient.type === 'Ouvrier' && (
                        <Form.Group className="mb-3">
                            <Form.Label>Taux de Commission (%)</Form.Label>
                            <Form.Control type="number" name="tauxCommission" min="0" max="100" value={currentClient.tauxCommission} onChange={handleChange} placeholder="Ex: 5" />
                        </Form.Group>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide} disabled={loading}>Annuler</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? <Spinner as="span" size="sm" /> : 'Enregistrer'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default ClientModal;