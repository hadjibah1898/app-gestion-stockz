/**
 * @file CashiersView.js
 * @description Vue de gestion des caissiers par le Gérant.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, Table } from 'react-bootstrap';
import { authAPI } from '../services/api';

const CashiersView = () => {
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ nom: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const boutiqueId = localStorage.getItem('boutiqueId');

  const fetchCashiers = useCallback(async () => {
    try {
      setLoading(true);
      // Récupérer les utilisateurs (Serveurs et Caissiers) de la boutique du gérant
      const res = await authAPI.getUsers({});
      const data = res.data || res;
      // Filtrer pour ne garder que les caissiers de cette boutique
      const cashiersList = Array.isArray(data) ? data.filter(u => {
        const userBoutiqueId = u.boutique?._id || u.boutique;
        return u.role === 'Caissier' && userBoutiqueId && userBoutiqueId.toString() === boutiqueId;
      }) : [];
      console.log('Caissiers chargés:', cashiersList);
      setCashiers(cashiersList);
    } catch (err) {
      console.error('Erreur chargement caissiers:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des caissiers.');
    } finally { setLoading(false); }
  }, [boutiqueId]);

  useEffect(() => { fetchCashiers(); }, [fetchCashiers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!boutiqueId) {
        setError("Erreur : Votre compte gérant n'est pas rattaché à une boutique.");
        return;
    }

    setSubmitLoading(true);
    setError('');

    try {
      // Utiliser l'endpoint create-cashier
      const payload = { 
        nom: formData.nom,
        email: formData.email,
        password: formData.password,
        role: 'Caissier', 
        boutique: boutiqueId 
      };
      console.log('Payload création caissier:', payload);
      const result = await authAPI.createCashier(payload);
      console.log('Résultat création:', result);
      setShowModal(false);
      setFormData({ nom: '', email: '', password: '' });
      fetchCashiers();
    } catch (err) { 
      console.error('Erreur détaillée:', err);
      const errorMsg = err.response?.data?.message || err.message || "Erreur lors de la création du caissier.";
      setError(`Détails: ${errorMsg}`); 
    } finally { 
      setSubmitLoading(false); 
    }
  };

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }}></Spinner></div>;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h3 className="fw-bold mb-1">Gestion des Caissiers</h3>
          <p className="text-muted mb-0">Créez et gérez les comptes caissiers de votre boutique</p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)} className="rounded-pill">
          <iconify-icon icon="solar:add-circle-bold" className="me-2"></iconify-icon>
          Nouveau Caissier
        </Button>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      {cashiers.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <Card.Body className="text-center py-5">
            <iconify-icon icon="solar:users-group-rounded-bold-duotone" style={{ fontSize: '64px', opacity: 0.3 }}></iconify-icon>
            <p className="text-muted mt-3 mb-0">Aucun caissier créé pour le moment</p>
            <Button variant="primary" onClick={() => setShowModal(true)} className="mt-3 rounded-pill">
              Créer votre premier caissier
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <Card.Body className="p-0">
            <Table hover responsive className="align-middle mb-0">
              <thead className="bg-light">
                <tr>
                  <th className="ps-4">Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Date de création</th>
                </tr>
              </thead>
              <tbody>
                {cashiers.map(cashier => (
                  <tr key={cashier._id}>
                    <td className="ps-4">
                      <div className="d-flex align-items-center">
                        <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-2" style={{ width: '40px', height: '40px' }}>
                          <iconify-icon icon="solar:user-bold" style={{ fontSize: '20px' }}></iconify-icon>
                        </div>
                        <span className="fw-bold">{cashier.nom}</span>
                      </div>
                    </td>
                    <td>{cashier.email}</td>
                    <td><Badge bg="info">Caissier</Badge></td>
                    <td>
                      <Badge bg={cashier.active ? "success" : "warning"}>
                        {cashier.active ? "Actif" : "En attente"}
                      </Badge>
                    </td>
                    <td>{new Date(cashier.createdAt).toLocaleDateString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {/* Modale de création de caissier */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>
              <iconify-icon icon="solar:user-plus-bold-duotone" className="me-2"></iconify-icon>
              Nouveau Caissier
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info" className="mb-3">
              <small>
                <iconify-icon icon="solar:info-circle-bold" className="me-1"></iconify-icon>
                Le caissier aura accès uniquement aux fonctionnalités de vente, caisse et créances de votre boutique.
              </small>
            </Alert>
            <Form.Group className="mb-3">
              <Form.Label>Nom Complet <span className="text-danger">*</span></Form.Label>
              <Form.Control 
                type="text" 
                value={formData.nom} 
                onChange={e => setFormData({...formData, nom: e.target.value})} 
                required
                placeholder="Ex: Jean Dupont"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email <span className="text-danger">*</span></Form.Label>
              <Form.Control 
                type="email" 
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                required
                placeholder="Ex: caissier@boutique.com"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mot de passe <span className="text-danger">*</span></Form.Label>
              <Form.Control 
                type="text" 
                value={formData.password} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
                required
                placeholder="Mot de passe temporaire"
              />
              <Form.Text className="text-muted">
                Le caissier devra changer ce mot de passe à sa première connexion.
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={submitLoading}>
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={submitLoading}>
              {submitLoading ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  Création...
                </>
              ) : (
                <>
                  <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                  Créer le compte
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default CashiersView;