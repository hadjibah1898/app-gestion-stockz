import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, InputGroup, Alert } from 'react-bootstrap';
import { Html5QrcodeScanner } from 'html5-qrcode';

const NewProductForSupplyModal = ({ show, onHide, onAddProduct }) => {
    const [product, setProduct] = useState({
        nom: '',
        type: '',
        code: '',
        datePeremption: '',
        image: '',
        quantite: 1,
        prixAchat: 0,
        prixVente: 0,
    });
    const [error, setError] = useState('');
    const [showScanner, setShowScanner] = useState(false);

    useEffect(() => {
        if (show) {
            // Reset form when modal is shown
            setProduct({
                nom: '', type: 'Divers', code: '', datePeremption: '', image: '',
                quantite: 1, prixAchat: 0, prixVente: 0,
            });
            setError('');
            setShowScanner(false);
        }
    }, [show]);

    // Barcode scanner logic
    useEffect(() => {
        let scanner;
        if (showScanner) {
            scanner = new Html5QrcodeScanner(
                "new-product-reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );

            const onScanSuccess = (decodedText) => {
                setProduct(p => ({ ...p, code: decodedText }));
                setShowScanner(false);
                if (scanner) {
                    scanner.clear().catch(err => console.error("Scanner clear failed", err));
                }
            };

            scanner.render(onScanSuccess, (err) => { /* ignore errors */ });
        }

        return () => {
            if (scanner && scanner.getState && scanner.getState() !== 2) { // 2 is NOT_STARTED
                scanner.clear().catch(err => console.error("Scanner clear failed on unmount", err));
            }
        };
    }, [showScanner]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProduct(p => ({ ...p, [name]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                setError("L'image est trop volumineuse (max 2Mo).");
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setProduct(p => ({ ...p, image: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        if (!product.nom || !product.quantite || !product.prixAchat) {
            setError("Les champs Nom, Quantité et Prix d'achat sont obligatoires.");
            return;
        }
        if (product.quantite <= 0 || product.prixAchat <= 0) {
            setError("La quantité et le prix d'achat doivent être positifs.");
            return;
        }
        if (product.prixVente > 0 && Number(product.prixAchat) >= Number(product.prixVente)) {
            setError("Le prix de vente doit être supérieur au prix d'achat.");
            return;
        }

        onAddProduct(product);
        onHide();
    };

    const total = (product.prixAchat || 0) * (product.quantite || 0);

    return (
        <Modal show={show} onHide={onHide} size="lg" centered>
            <Modal.Header closeButton>
                <Modal.Title>Ajouter un nouveau produit à l'approvisionnement</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Row>
                        <Col md={8}>
                            <Form.Group className="mb-3">
                                <Form.Label>Nom du produit</Form.Label>
                                <Form.Control type="text" name="nom" value={product.nom} onChange={handleChange} required autoFocus />
                            </Form.Group>
                            <Row>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Code-barres</Form.Label>
                                        <InputGroup>
                                            <Form.Control type="text" name="code" value={product.code} onChange={handleChange} />
                                            <Button variant="outline-secondary" onClick={() => setShowScanner(!showScanner)}>
                                                <iconify-icon icon="solar:barcode-scanner-bold-duotone"></iconify-icon>
                                            </Button>
                                        </InputGroup>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Type</Form.Label>
                                        <Form.Control type="text" name="type" value={product.type} onChange={handleChange} placeholder="Ex: Boisson, Ciment..." />
                                    </Form.Group>
                                </Col>
                            </Row>
                            <Row>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Quantité</Form.Label>
                                        <Form.Control type="number" name="quantite" value={product.quantite} onChange={handleChange} required min="1" />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Date de Péremption</Form.Label>
                                        <Form.Control type="date" name="datePeremption" value={product.datePeremption} onChange={handleChange} />
                                    </Form.Group>
                                </Col>
                            </Row>
                            <Row>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Prix d'achat unitaire</Form.Label>
                                        <InputGroup>
                                            <Form.Control type="number" name="prixAchat" value={product.prixAchat} onChange={handleChange} required min="0" />
                                            <InputGroup.Text>GNF</InputGroup.Text>
                                        </InputGroup>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>Prix de vente unitaire</Form.Label>
                                        <InputGroup>
                                            <Form.Control type="number" name="prixVente" value={product.prixVente} onChange={handleChange} min="0" />
                                            <InputGroup.Text>GNF</InputGroup.Text>
                                        </InputGroup>
                                    </Form.Group>
                                </Col>
                            </Row>
                        </Col>
                        <Col md={4}>
                            <Form.Group className="mb-3">
                                <Form.Label>Image</Form.Label>
                                <Form.Control type="file" accept="image/*" onChange={handleImageChange} />
                                {product.image && <img src={product.image} alt="Aperçu" className="img-fluid rounded mt-2" />}
                            </Form.Group>
                        </Col>
                    </Row>
                    {showScanner && (
                        <div className="mt-3">
                            <div id="new-product-reader" style={{ width: '100%' }}></div>
                            <Button variant="danger" size="sm" className="mt-2" onClick={() => setShowScanner(false)}>Fermer le scanner</Button>
                        </div>
                    )}
                    <Alert variant="success" className="mt-3">
                        <strong>Total Achat : {total.toLocaleString()} GNF</strong>
                    </Alert>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onHide}>Annuler</Button>
                    <Button variant="primary" type="submit">Ajouter au lot</Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default NewProductForSupplyModal;