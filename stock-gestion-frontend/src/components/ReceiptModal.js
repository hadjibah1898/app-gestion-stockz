/**
 * @file ReceiptModal.js
 * @description Modale qui s'affiche après une vente réussie pour proposer l'impression du ticket.
 * Ce composant est purement présentationnel. Il reçoit les fonctions `onHide` (pour ignorer)
 * et `onPrint` (pour imprimer) via ses props.
 * Le paramètre `backdrop="static"` empêche la fermeture en cliquant à l'extérieur.
 */
import React from 'react';
import { Modal, Button } from 'react-bootstrap';

const ReceiptModal = ({ show, onHide, onPrint }) => {
    return (
        <Modal show={show} onHide={onHide} centered backdrop="static" keyboard={false}>
            <Modal.Header>
                <Modal.Title>Ticket de Caisse</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center py-4">
                <iconify-icon icon="solar:printer-bold-duotone" style={{ fontSize: '64px' }} className="text-primary mb-3"></iconify-icon>
                <h5 className="mb-3">Vente enregistrée avec succès !</h5>
                <p className="text-muted">Voulez-vous imprimer le ticket de caisse ?</p>
            </Modal.Body>
            <Modal.Footer className="justify-content-center gap-3">
                <Button variant="secondary" onClick={onHide} className="px-4">Ignorer</Button>
                <Button variant="primary" onClick={onPrint} className="px-4">
                    <iconify-icon icon="solar:printer-bold" className="me-2"></iconify-icon>Imprimer
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default ReceiptModal;