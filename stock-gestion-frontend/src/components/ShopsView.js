// src/components/ShopsView.js
import React, { useState, useEffect, useRef } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';
import { boutiqueAPI, articleAPI } from '../services/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import RestockModal from './RestockModal'; // Importer la nouvelle modale
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Correction des icônes Leaflet par défaut dans React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Icône par défaut (bleue)
const blueIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

// Icône pour la boutique sélectionnée (verte)
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
// Composant utilitaire pour recentrer la carte
const RecenterMap = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
};

const ShopsView = () => {
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentBoutique, setCurrentBoutique] = useState({
    _id: '',
    nom: '',
    adresse: '',
    active: true,
    type: 'Secondaire',
    latitude: 9.6412,
    longitude: -13.5784
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Nombre de boutiques par page
  const [searchTerm, setSearchTerm] = useState(''); // État pour la recherche

  // États pour le transfert de stock
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ sourceId: '', targetId: '' });
  const [transferMessage, setTransferMessage] = useState({ type: '', text: '' });
  const [sourceArticles, setSourceArticles] = useState([]);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [transferQuantities, setTransferQuantities] = useState({}); // Nouvel état pour les quantités
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);

  // États pour la confirmation de suppression (Modale moderne)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [boutiqueToDelete, setBoutiqueToDelete] = useState(null);

  const [showRestockModal, setShowRestockModal] = useState(false);
  const [centralShop, setCentralShop] = useState(null);

  // État pour basculer entre la vue Liste et la vue Carte
  const [viewMode, setViewMode] = useState('list'); // 'list' ou 'map'
  const [forcedCenter, setForcedCenter] = useState(null); // Pour la géolocalisation
  const [selectedBoutiqueId, setSelectedBoutiqueId] = useState(null); // Pour le marqueur sélectionné
  const [radius, setRadius] = useState(500); // Rayon en mètres

  // Ref pour stocker les références des marqueurs de la carte
  const markerRefs = useRef({});

  useEffect(() => {
    fetchBoutiques();
  }, []);

  const fetchBoutiques = async () => {
    try {
      setLoading(true);
      const response = await boutiqueAPI.getAll();
      setBoutiques(response.data);
      // Identifier la boutique centrale pour le réapprovisionnement
      const centrale = response.data.find(b => b.type === 'Centrale');
      setCentralShop(centrale);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  // Effet pour ouvrir le popup automatiquement quand une boutique est sélectionnée sur la carte
  useEffect(() => {
    if (viewMode === 'map' && selectedBoutiqueId && markerRefs.current[selectedBoutiqueId]) {
      // Un petit délai pour s'assurer que la carte a eu le temps de se recentrer
      setTimeout(() => {
        markerRefs.current[selectedBoutiqueId]?.openPopup();
      }, 100);
    }
  }, [selectedBoutiqueId, viewMode]);

  // Charger les articles quand la boutique source change
  useEffect(() => {
    if (transferData.sourceId) {
        setLoadingArticles(true);
        articleAPI.getAll().then(res => {
            // Filtrer les articles de la boutique source
            const shopArticles = res.data.filter(a => (a.boutique?._id || a.boutique) === transferData.sourceId);
            setSourceArticles(shopArticles);
            setSelectedArticles([]); // Réinitialiser la sélection
            setTransferQuantities({});
        }).catch(err => console.error(err)).finally(() => setLoadingArticles(false));
    } else {
        setSourceArticles([]);
        setSelectedArticles([]);
        setTransferQuantities({});
    }
  }, [transferData.sourceId]);

  const handleShowModal = (boutique = null) => {
    if (boutique) {
      setCurrentBoutique(boutique);
      setEditMode(true);
    } else {
      setCurrentBoutique({ nom: '', adresse: '', active: true, type: 'Secondaire', latitude: 9.6412, longitude: -13.5784 });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentBoutique({
      ...currentBoutique,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      if (editMode) {
        await boutiqueAPI.update(currentBoutique._id, currentBoutique);
        setSuccessMessage('Boutique modifiée avec succès !');
      } else {
        await boutiqueAPI.create(currentBoutique);
        setSuccessMessage('Boutique créée avec succès !');
      }
      fetchBoutiques();
      handleCloseModal();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur d\'enregistrement');
    }
  };

  const handleRestockSuccess = (message) => {
    setSuccessMessage(message);
    // Mise à jour automatique des données
    fetchBoutiques();
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleTransferSourceChange = (e) => {
    const sourceId = e.target.value;
    // Réinitialiser la cible lorsque la source change pour forcer une nouvelle sélection valide
    setTransferData({ sourceId: sourceId, targetId: '' });
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferLoading(true);
    setTransferMessage({ type: '', text: '' });
    if (transferData.sourceId === transferData.targetId) {
        setTransferLoading(false);
        return setTransferMessage({ type: 'danger', text: "La boutique source et destination doivent être différentes." });
    }
    
    if (selectedArticles.length === 0) {
        setTransferLoading(false);
        return setTransferMessage({ type: 'warning', text: "Veuillez sélectionner au moins un article (ou tout sélectionner)." });
    }

    // Préparer les données avec quantités
    const articlesPayload = selectedArticles.map(id => ({
        articleId: id,
        quantite: transferQuantities[id] || sourceArticles.find(a => a._id === id)?.quantite || 1
    }));

    try {
        const res = await articleAPI.transferStock({ ...transferData, articles: articlesPayload });
        setShowTransferModal(false);
        setSuccessMessage(res.data.message);
        setTransferData({ sourceId: '', targetId: '' });
        setTransferMessage({ type: '', text: '' });
        setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
        setTransferMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du transfert." });
    } finally {
        setTransferLoading(false);
    }
  };

  const confirmDelete = (id) => {
    setBoutiqueToDelete(id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    setError('');
    setSuccessMessage('');
    try {
      await boutiqueAPI.delete(boutiqueToDelete);
      fetchBoutiques();
      setShowDeleteModal(false);
      setSuccessMessage('Boutique supprimée avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de suppression');
      setShowDeleteModal(false);
    }
  };

  const handleLocate = (boutique) => {
    if (boutique.latitude && boutique.longitude) {
      setForcedCenter([boutique.latitude, boutique.longitude]);
      setSelectedBoutiqueId(boutique._id);
      setViewMode('map');
    } else {
      setError("Coordonnées GPS manquantes pour cette boutique.");
      setTimeout(() => setError(''), 3000);
    }
  };

  const columns = [
    { key: 'nom', label: 'Nom' },
    { key: 'adresse', label: 'Adresse' },
    {
      key: 'type',
      label: 'Type',
      render: (value) => (
        <Badge pill bg={value === 'Centrale' ? 'primary' : 'secondary'}>
          {/* Affiche 'Secondaire' si le type n'est pas défini pour les anciennes boutiques */}
          {value || 'Secondaire'}
        </Badge>
      )
    },
    { 
      key: 'active', 
      label: 'Statut',
      render: (value) => (
        <Badge pill bg={value ? 'success' : 'danger'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    { 
      key: 'actions',
      label: 'Actions',
      render: (_, boutique) => (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip>Localiser sur la carte</Tooltip>}>
            <Button
              variant="link"
              className="text-info p-0"
              onClick={() => handleLocate(boutique)}
            >
              <iconify-icon icon="solar:map-point-bold" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip id={`tooltip-edit-${boutique._id}`}>Modifier</Tooltip>}>
            <Button
              variant="link"
              className="text-primary p-0"
              onClick={() => handleShowModal(boutique)}
            >
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip id={`tooltip-delete-${boutique._id}`}>Supprimer</Tooltip>}>
            <Button
              variant="link"
              className="text-danger p-0"
              onClick={() => confirmDelete(boutique._id)}
            >
              <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  // Logique de filtrage et pagination
  const filteredBoutiques = boutiques.filter(boutique => 
    boutique.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentBoutiques = filteredBoutiques.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredBoutiques.length / itemsPerPage);

  const selectedBoutique = boutiques.find(b => b._id === selectedBoutiqueId);

  // Logique pour filtrer les boutiques de destination dans la modale de transfert
  const getTargetBoutiquesForTransfer = () => {
    if (!transferData.sourceId) {
      return []; // Pas de source, pas de destination
    }
    // Retourne toutes les boutiques sauf la source
    return boutiques.filter(b => b._id !== transferData.sourceId);
  };

  // Calcul du centre de la carte (Centrale ou défaut)
  const defaultCenter = centralShop 
    ? [centralShop.latitude || 9.6412, centralShop.longitude || -13.5784] 
    : [9.6412, -13.5784];
  
  const mapCenter = forcedCenter || defaultCenter;

  // Préparation des lignes de flux (Centrale -> Secondaires)
  const flowLines = centralShop ? boutiques.filter(b => b.type === 'Secondaire' && b.latitude && b.longitude).map(b => [[centralShop.latitude, centralShop.longitude], [b.latitude, b.longitude]]) : [];

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0 text-body">Gestion des Boutiques</h3>
        <div className="d-flex gap-2">
            {/* Boutons de bascule Vue Liste / Vue Carte */}
            <div className="btn-group me-2" role="group">
                <Button variant={viewMode === 'list' ? 'primary' : 'outline-primary'} onClick={() => { setViewMode('list'); setSelectedBoutiqueId(null); }}>
                    <iconify-icon icon="solar:list-bold" className="me-1 align-middle"></iconify-icon> Liste
                </Button>
                <Button variant={viewMode === 'map' ? 'primary' : 'outline-primary'} onClick={() => setViewMode('map')}>
                    <iconify-icon icon="solar:map-point-bold" className="me-1 align-middle"></iconify-icon> Carte
                </Button>
            </div>
            <Button variant="outline-primary" onClick={() => setShowTransferModal(true)} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:box-minimalistic-bold" className="me-2 align-middle"></iconify-icon>
                Transférer Stock
            </Button>
            <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:add-circle-bold" className="me-2 align-middle"></iconify-icon>
                Ajouter une Boutique
            </Button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="mb-4">
        <Form.Control
          type="text"
          placeholder="Rechercher une boutique par nom..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{ maxWidth: '300px' }}
          className="shadow-sm"
        />
      </div>

      {/* Alerte si aucune boutique centrale n'est configurée */}
      {!centralShop && !loading && (
        <Alert variant="warning" className="shadow-sm mt-3">
          <div className="d-flex align-items-center">
            <iconify-icon icon="solar:info-circle-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
            <span><strong>Information :</strong> Le bouton "Réapprovisionner" n'apparaît que si une boutique de type "Centrale" est configurée.</span>
          </div>
        </Alert>
      )}

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      {viewMode === 'list' ? (
        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
            <Card.Body className="p-0">
            <TableComponent 
                columns={columns}
                data={currentBoutiques}
                emptyMessage="Aucune boutique trouvée"
            />
            {totalPages > 1 && (
                <div className="d-flex justify-content-center p-3 border-top">
                <Pagination className="mb-0">
                    <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                    {[...Array(totalPages)].map((_, idx) => (
                    <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>
                        {idx + 1}
                    </Pagination.Item>
                    ))}
                    <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                </Pagination>
                </div>
            )}
            </Card.Body>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
            <Card.Header className="d-flex justify-content-between align-items-center py-3">
                <h5 className="fw-bold mb-0">Carte des Boutiques</h5>
                <div className="d-flex align-items-center gap-2" style={{maxWidth: '250px'}}>
                    <Form.Label className="mb-0 small text-nowrap">Rayon (m):</Form.Label>
                    <Form.Control 
                        type="number" 
                        size="sm" 
                        value={radius} 
                        onChange={e => setRadius(Number(e.target.value))}
                        step="100"
                        min="100"
                    />
                </div>
            </Card.Header>
            <Card.Body className="p-0">
                <div style={{ height: '600px', width: '100%' }}>
                    <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <RecenterMap center={mapCenter} />
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        {/* Lignes de flux (Réseau) */}
                        {flowLines.map((line, idx) => (
                            <Polyline key={idx} positions={line} color="blue" dashArray="5, 10" weight={2} opacity={0.5} />
                        ))}

                        {/* Cercle de rayon autour de la boutique sélectionnée */}
                        {selectedBoutique && selectedBoutique.latitude && selectedBoutique.longitude && (
                            <Circle
                                center={[selectedBoutique.latitude, selectedBoutique.longitude]}
                                radius={radius}
                                pathOptions={{ color: '#198754', fillColor: '#198754', fillOpacity: 0.1 }}
                            />
                        )}

                        {/* Marqueurs des boutiques */}
                        {boutiques.map(boutique => (
                            boutique.latitude && boutique.longitude && (
                                <Marker 
                                    key={boutique._id} 
                                    position={[boutique.latitude, boutique.longitude]}
                                    ref={(el) => (markerRefs.current[boutique._id] = el)}
                                    icon={boutique._id === selectedBoutiqueId ? greenIcon : blueIcon}
                                    eventHandlers={{
                                        click: () => {
                                            setSelectedBoutiqueId(boutique._id);
                                        },
                                    }}
                                >
                                    <Popup>
                                        <div className="text-center">
                                            <h6 className="fw-bold mb-1">{boutique.nom}</h6>
                                            <Badge bg={boutique.type === 'Centrale' ? 'primary' : 'secondary'} className="mb-2">{boutique.type}</Badge>                                            <p className="mb-0 small">{boutique.adresse}</p>
                                        </div>
                                    </Popup>
                                </Marker>
                            )
                        ))}
                    </MapContainer>
                </div>
            </Card.Body>
        </Card>
      )}

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editMode ? 'Modifier la Boutique' : 'Nouvelle Boutique'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom de la boutique</Form.Label>
              <Form.Control
                type="text"
                name="nom"
                value={currentBoutique.nom}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Adresse</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="adresse"
                value={currentBoutique.adresse}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Type de boutique</Form.Label>
              <Form.Select
                name="type"
                value={currentBoutique.type || 'Secondaire'}
                onChange={handleChange}
                required
              >
                <option value="Secondaire">Secondaire</option>
                <option value="Centrale">Centrale</option>
              </Form.Select>
            </Form.Group>
            
            <div className="row">
                <div className="col-md-6">
                    <Form.Group className="mb-3">
                        <Form.Label>Latitude</Form.Label>
                        <Form.Control
                            type="number" step="any" name="latitude"
                            value={currentBoutique.latitude} onChange={handleChange}
                        />
                    </Form.Group>
                </div>
                <div className="col-md-6">
                    <Form.Group className="mb-3">
                        <Form.Label>Longitude</Form.Label>
                        <Form.Control
                            type="number" step="any" name="longitude"
                            value={currentBoutique.longitude} onChange={handleChange}
                        />
                    </Form.Group>
                </div>
            </div>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                name="active"
                label="Boutique active"
                checked={currentBoutique.active}
                onChange={handleChange}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              {editMode ? 'Modifier' : 'Créer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de Réapprovisionnement (maintenant un composant séparé) */}
      <RestockModal show={showRestockModal} onHide={() => setShowRestockModal(false)} onSuccess={handleRestockSuccess} />

      {/* Modale de Transfert de Stock */}
      <Modal show={showTransferModal} onHide={() => setShowTransferModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Transférer le Stock</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleTransfer}>
          <Modal.Body>
            <Alert variant="info" className="small">
                Déplacez tous les articles d'une boutique à une autre. Utile avant de supprimer une boutique ou lors d'un changement de gérant.
            </Alert>
            {transferMessage.text && <Alert variant={transferMessage.type}>{transferMessage.text}</Alert>}
            
            <Form.Group className="mb-3">
              <Form.Label>Depuis la boutique (Source)</Form.Label>
              <Form.Select 
                value={transferData.sourceId}
                onChange={handleTransferSourceChange}
                required
              >
                <option value="">Sélectionner...</option>
                {boutiques.map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
              </Form.Select>
            </Form.Group>

            {/* Liste de sélection des articles */}
            {transferData.sourceId && (
                <Form.Group className="mb-3">
                    <Form.Label>Sélectionner les articles à transférer</Form.Label>
                    {loadingArticles ? <div className="text-center"><Spinner size="sm" /></div> : (
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dee2e6', padding: '10px', borderRadius: '4px' }}>
                            {sourceArticles.length > 0 ? (
                                <>
                                <Form.Check 
                                    type="checkbox"
                                    label="Tout sélectionner"
                                    checked={selectedArticles.length === sourceArticles.length && sourceArticles.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedArticles(sourceArticles.map(a => a._id));
                                        else {
                                            setSelectedArticles([]);
                                            setTransferQuantities({});
                                        }
                                    }}
                                    className="mb-2 fw-bold text-primary"
                                />
                                {sourceArticles.map(article => (
                                    <div key={article._id} className="d-flex align-items-center justify-content-between mb-2 border-bottom pb-1">
                                        <Form.Check 
                                            type="checkbox"
                                            label={`${article.nom} (Dispo: ${article.quantite})`}
                                            checked={selectedArticles.includes(article._id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedArticles([...selectedArticles, article._id]);
                                                    // Par défaut, quantité max
                                                    setTransferQuantities({...transferQuantities, [article._id]: article.quantite});
                                                } else {
                                                    setSelectedArticles(selectedArticles.filter(id => id !== article._id));
                                                }
                                            }}
                                            className="flex-grow-1"
                                        />
                                        {selectedArticles.includes(article._id) && (
                                            <Form.Control 
                                                type="number" 
                                                min="1" 
                                                max={article.quantite}
                                                value={transferQuantities[article._id] || article.quantite}
                                                onChange={(e) => setTransferQuantities({...transferQuantities, [article._id]: parseInt(e.target.value)})}
                                                style={{ width: '80px' }}
                                                size="sm"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        )}
                                    </div>
                                ))}
                                </>
                            ) : <p className="text-muted small mb-0">Aucun article dans cette boutique.</p>}
                        </div>
                    )}
                    <Form.Text className="text-muted">
                        {selectedArticles.length} article(s) sélectionné(s)
                    </Form.Text>
                </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Vers la boutique (Destination)</Form.Label>
              <Form.Select 
                value={transferData.targetId}
                onChange={(e) => setTransferData({...transferData, targetId: e.target.value})}
                required
                disabled={!transferData.sourceId}
              >
                <option value="">Sélectionner une destination...</option>
                {getTargetBoutiquesForTransfer().map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Fermer</Button>
            <Button variant="primary" type="submit" disabled={transferLoading}>
              {transferLoading ? <Spinner as="span" animation="border" size="sm" /> : 'Transférer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de Confirmation de Suppression (Moderne) */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">⚠️ Suppression de Boutique</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold">Êtes-vous sûr de vouloir supprimer cette boutique ?</p>
          <Alert variant="warning" className="mb-0 small">
            <iconify-icon icon="solar:danger-triangle-bold" className="me-2 align-middle"></iconify-icon>
            Cette action est irréversible. Assurez-vous que la boutique est vide ou utilisez "Transférer Stock" au préalable.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Annuler</Button>
          <Button variant="danger" onClick={executeDelete}>Supprimer définitivement</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ShopsView;