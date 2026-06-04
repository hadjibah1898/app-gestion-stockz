import React from 'react';
import { Button, Badge } from 'react-bootstrap';

/**
 * Composant pour afficher des actions rapides selon le secteur de la boutique.
 */
const SecteurQuickActions = ({ secteur, onAddQuickItem, activeTab }) => {
    if (activeTab !== 'sale') return null;

    switch (secteur) {
        case 'Boite de nuit':
            return (
                <div className="d-flex gap-2 ms-2 animate__animated animate__fadeIn">
                    <Button 
                        variant="info" 
                        size="sm" 
                        className="rounded-pill btn-quick-entry d-flex align-items-center" 
                        onClick={() => onAddQuickItem('Entrée')}
                    >
                        <iconify-icon icon="solar:ticket-bold" className="me-1"></iconify-icon>
                        <span className="small">+ Entrée</span>
                    </Button>
                    <Button 
                        variant="info" 
                        size="sm" 
                        className="rounded-pill btn-quick-entry d-flex align-items-center" 
                        onClick={() => onAddQuickItem('Vestiaire')}
                    >
                        <iconify-icon icon="solar:hanger-bold" className="me-1"></iconify-icon>
                        <span className="small">+ Vestiaire</span>
                    </Button>
                </div>
            );
        case 'Restaurant':
            return (
                <Badge bg="primary" pill className="ms-2">Mode Service à Table</Badge>
            );
        default:
            return null;
    }
};

export default SecteurQuickActions;