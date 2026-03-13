/**
 * @file SaleTab.js
 * @description Ce composant est un composant de présentation ("bête").
 * Il gère l'interface principale de l'onglet "Effectuer une Vente".
 * Il affiche le formulaire d'ajout d'article (par scan ou sélection manuelle), le panier, le total et les options de paiement.
 * Il reçoit toutes les données (articles, clients, panier) et les fonctions de manipulation (ajouter, retirer, valider) via ses props
 * depuis le composant parent `VentesView`.
 */
import React from 'react';
import { Row, Col, Card, Form, InputGroup, Button, Table, Badge, Alert } from 'react-bootstrap';

const SaleTab = ({
    panier,
    clients,
    articles,
    selectedClientId,
    setSelectedClientId,
    setShowClientModal,
    barcodeInputRef,
    barcode,
    setBarcode,
    handleBarcodeScan,
    selectedArticle,
    setSelectedArticle,
    quantite,
    setQuantite,
    remisePanier,
    setRemisePanier,
    ajouterAuPanier,
    getEffectivePrice,
    handleImageClick,
    retirerDuPanier,
    montantPaye,
    setMontantPaye,
    echeanceDette,
    setEcheanceDette,
    calculerTotal,
    effectuerVente,
    historique
}) => {
    return (
        <Row>
            <Col md={8}>
                <Card className="mb-4 border-0 shadow-sm rounded-4">
                    <Card.Header className="bg-white py-3">
                        <div className="d-flex justify-content-between align-items-center">
                            <h5 className="mb-0 fw-bold">Panier de vente</h5>
                            <div className="d-flex gap-2">
                                <Button variant="outline-primary" size="sm" onClick={() => setShowClientModal(true)} title="Nouveau Client">
                                    <iconify-icon icon="solar:user-plus-bold" className="me-1"></iconify-icon>
                                    Nouveau Client
                                </Button>
                            </div>
                        </div>
                    </Card.Header>
                    <Card.Body>
                        <Form.Group className="mb-4">
                            <Form.Label className="fw-bold">Client (Optionnel)</Form.Label>
                            <InputGroup>
                                <InputGroup.Text><iconify-icon icon="solar:user-circle-bold"></iconify-icon></InputGroup.Text>
                                <Form.Select
                                    value={selectedClientId}
                                    onChange={(e) => setSelectedClientId(e.target.value)}
                                    className="rounded-pill"
                                >
                                    <option value="">Client de passage (Anonyme)</option>
                                    {clients.map(client => (
                                        <option key={client._id} value={client._id}>{client.nom} {client.type === 'Ouvrier' ? '(Ouvrier)' : ''}</option>
                                    ))}
                                </Form.Select>
                            </InputGroup>
                        </Form.Group>

                        <Form onSubmit={handleBarcodeScan} className="mb-4">
                            <Form.Group>
                                <Form.Label className="fw-bold">Scanner un code-barres</Form.Label>
                                <InputGroup>
                                    <InputGroup.Text><iconify-icon icon="solar:barcode-scanner-bold-duotone"></iconify-icon></InputGroup.Text>
                                    <Form.Control
                                        ref={barcodeInputRef}
                                        type="text"
                                        name="barcode"
                                        id="barcode"
                                        placeholder="Scannez ou saisissez un code..."
                                        value={barcode}
                                        onChange={(e) => setBarcode(e.target.value)}
                                        autoFocus
                                        className="rounded-pill"
                                    />
                                    <Button type="submit" variant="primary" className="rounded-pill px-4">
                                        <iconify-icon icon="solar:add-circle-bold" className="me-2"></iconify-icon>
                                        Ajouter
                                    </Button>
                                </InputGroup>
                            </Form.Group>
                        </Form>
                        <div className="text-center text-muted my-3 small fw-bold">OU</div>
                        <Form className="mb-4" onSubmit={(e) => { e.preventDefault(); ajouterAuPanier(); }}>
                            <Row className="g-3">
                                <Col md={5}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold">Article</Form.Label>
                                        <Form.Select
                                            value={selectedArticle}
                                            onChange={(e) => setSelectedArticle(e.target.value)}
                                            name="selectedArticle"
                                            id="selectedArticle"
                                            className="rounded-pill"
                                        >
                                            <option value="">Sélectionner un article</option>
                                            {articles.map(article => (
                                                <option key={article._id} value={article._id}>
                                                    {article.code ? `[${article.code}] ` : ''}{article.nom} - {getEffectivePrice(article).toLocaleString()} GNF
                                                    {getEffectivePrice(article) < article.prixVente && (
                                                        ` (Promo)`
                                                    )}
                                                    (Stock: {article.quantite})
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Form.Group>
                                </Col>
                                <Col md={2}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold">Quantité</Form.Label>
                                        <Form.Control
                                            type="number"
                                            min="1"
                                            value={quantite}
                                            onChange={(e) => setQuantite(e.target.value)}
                                            name="quantite"
                                            id="quantite"
                                            className="rounded-pill"
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={2}>
                                    <Form.Group>
                                        <Form.Label className="fw-bold">Remise (GNF)</Form.Label>
                                        <Form.Control
                                            type="number"
                                            min="0"
                                            value={remisePanier}
                                            onChange={(e) => setRemisePanier(e.target.value)}
                                            name="remisePanier"
                                            id="remisePanier"
                                            placeholder="0"
                                            className="rounded-pill"
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={3} className="d-flex align-items-end">
                                    <Button
                                        variant="primary"
                                        onClick={ajouterAuPanier}
                                        disabled={!selectedArticle}
                                        className="w-100 rounded-pill py-2"
                                    >
                                        <iconify-icon icon="solar:cart-plus-bold" className="me-2"></iconify-icon>
                                        Ajouter au panier
                                    </Button>
                                </Col>
                            </Row>
                        </Form>

                        {panier.length > 0 ? (
                            <>
                                <Table hover responsive className="align-middle mb-0">
                                    <thead className="bg-light">
                                        <tr>
                                            <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Article</th>
                                            <th className="py-3 border-0 text-secondary small text-uppercase">Prix unitaire</th>
                                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Quantité</th>
                                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                                            <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {panier.map(item => (
                                            <tr key={item.article._id}>
                                                <td className="ps-4">
                                                    <div className="d-flex align-items-center">
                                                        {item.article.image ? (
                                                            <img src={item.article.image} alt="" className="rounded shadow-sm me-3" style={{ width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer' }} onClick={() => handleImageClick(item.article.image)} />
                                                        ) : (
                                                            <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{ width: '40px', height: '40px' }}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                                        )}
                                                        <div>
                                                            <div className="fw-bold">{item.article.nom}</div>
                                                            {item.article.code && <div className="small text-muted">{item.article.code}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    {getEffectivePrice(item.article, item.remiseTemp) < item.article.prixVente ? (
                                                        <>
                                                            <span className="text-decoration-line-through text-muted me-2">{item.article.prixVente.toLocaleString()}</span>
                                                            <span className="text-danger fw-bold">{getEffectivePrice(item.article, item.remiseTemp).toLocaleString()} GNF</span>
                                                            {item.remiseTemp && <span className="badge bg-warning ms-2">Remise {item.remiseTemp.toLocaleString()} GNF</span>}
                                                        </>
                                                    ) : (
                                                        `${item.article.prixVente.toLocaleString()} GNF`
                                                    )}
                                                </td>
                                                <td className="text-center"><Badge bg="light" text="dark" className="border">{item.quantite}</Badge></td>
                                                <td className="text-end fw-bold text-primary">{item.prixTotal.toLocaleString()} GNF</td>
                                                <td className="pe-4 text-end">
                                                    <Button
                                                        variant="outline-danger"
                                                        size="sm"
                                                        onClick={() => retirerDuPanier(item.article._id)}
                                                    >
                                                        <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                                                        Retirer
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                                {selectedClientId && (
                                    <Row className="justify-content-end mt-3">
                                        <Col md={5}>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="fw-bold">Montant Payé (Optionnel)</Form.Label>
                                                <InputGroup>
                                                    <Form.Control
                                                        type="number"
                                                        placeholder={`Total : ${calculerTotal().toLocaleString()} GNF`}
                                                        value={montantPaye}
                                                        onChange={(e) => setMontantPaye(e.target.value)}
                                                        min="0"
                                                        className="rounded-pill"
                                                    />
                                                    <InputGroup.Text>GNF</InputGroup.Text>
                                                </InputGroup>
                                                <Form.Text className="text-muted">
                                                    Si le montant est inférieur au total, la différence sera ajoutée à la dette du client.
                                                </Form.Text>
                                            </Form.Group>
                                        </Col>
                                        {montantPaye !== '' && parseFloat(montantPaye) < calculerTotal() && (
                                            <Col md={5}>
                                                <Form.Group className="mb-3">
                                                    <Form.Label className="fw-bold text-danger">Échéance de la dette</Form.Label>
                                                    <Form.Control
                                                        type="date"
                                                        value={echeanceDette}
                                                        onChange={(e) => setEcheanceDette(e.target.value)}
                                                        required
                                                        className="rounded-pill"
                                                    />
                                                </Form.Group>
                                            </Col>
                                        )}
                                    </Row>
                                )}
                                <div className="d-flex justify-content-between align-items-center mt-3">
                                    <h2 className="fw-bold text-primary">Total: {calculerTotal().toLocaleString()} GNF</h2>
                                    <Button variant="success" size="lg" onClick={effectuerVente}>
                                        Valider la vente
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <Alert variant="info">
                                Le panier est vide. Ajoutez des articles pour effectuer une vente.
                            </Alert>
                        )}
                    </Card.Body>
                </Card>
            </Col>

            <Col md={4}>
                <Card className="border-0 shadow-sm rounded-4">
                    <Card.Header>Historique récent</Card.Header>
                    <Card.Body>
                        {historique.filter(v => !v.isCancelled).slice(0, 5).map(vente => (
                            <div key={vente._id} className="d-flex gap-3 mb-3 pb-3 border-bottom">
                                {vente.article?.image && <img src={vente.article?.image} alt="" className="rounded" style={{ width: '45px', height: '45px', objectFit: 'cover', cursor: 'pointer' }} onClick={() => handleImageClick(vente.article?.image)} />}
                                <div className="flex-grow-1">
                                    <div className="d-flex justify-content-between">
                                        <div>
                                            <div className="fw-bold">{vente.article?.nom || 'Article supprimé'}</div>
                                            {vente.remiseAppliquee > 0 && !vente.isCancelled && (
                                                <Badge bg="warning" text="dark" pill>Remise {vente.remiseAppliquee.toLocaleString()} GNF</Badge>
                                            )}
                                        </div>
                                        <Badge bg="success" text="white">{vente.prixTotal.toLocaleString()} GNF</Badge>
                                    </div>
                                    <div className="text-muted small mt-1">
                                        Quantité: {vente.quantite} | Date: {new Date(vente.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {historique.length === 0 && (
                            <Alert variant="info">Aucune vente enregistrée</Alert>
                        )}
                    </Card.Body>
                </Card>
            </Col>
        </Row>
    );
};

export default SaleTab;