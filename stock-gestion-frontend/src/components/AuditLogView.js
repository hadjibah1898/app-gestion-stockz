import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Form, Row, Col, Badge,  Pagination, Table } from 'react-bootstrap';
import { auditAPI, authAPI } from '../services/api';

const AuditLogView = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ user: '', action: '', startDate: '', endDate: '' });
    const [users, setUsers] = useState([]); // To populate user filter

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const res = await auditAPI.getLogs(filters);
            setLogs(res.data);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement des journaux d'audit.");
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await authAPI.getUsers();
            setUsers(res.data);
        } catch (err) {
            console.error("Could not fetch users for filter", err);
        }
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    const getStatusBadge = (status) => {
        return status === 'SUCCESS' ? <Badge bg="success">Succès</Badge> : <Badge bg="danger">Échec</Badge>;
    };

    // Pagination logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentLogs = logs.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(logs.length / itemsPerPage);

    return (
        <div className="p-4">
            <h3 className="fw-bold mb-4">Journal d'Audit des Actions</h3>
            {error && <Alert variant="danger">{error}</Alert>}

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3">
                        <Col md={3}>
                            <Form.Label>Utilisateur</Form.Label>
                            <Form.Select name="user" value={filters.user} onChange={handleFilterChange}>
                                <option value="">Tous les utilisateurs</option>
                                {users.map(u => <option key={u._id} value={u._id}>{u.nom}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Action (contient)</Form.Label>
                            <Form.Control type="text" name="action" placeholder="Ex: LOGIN_SUCCESS" value={filters.action} onChange={handleFilterChange} />
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date début</Form.Label>
                            <Form.Control type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date fin</Form.Label>
                            <Form.Control type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    {loading ? (
                        <div className="text-center p-5"><Spinner animation="border" /></div>
                    ) : (
                        <Table hover responsive className="align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Date</th>
                                    <th>Utilisateur</th>
                                    <th>Action</th>
                                    <th>Entité</th>
                                    <th>Détails</th>
                                    <th>IP</th>
                                    <th className="text-center">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentLogs.length > 0 ? (
                                    currentLogs.map(log => (
                                        <tr key={log._id}>
                                            <td className="ps-4 text-nowrap">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                                            <td>{log.userName}</td>
                                            <td><Badge bg="primary-subtle" text="primary-emphasis">{log.action}</Badge></td>
                                            <td>{log.entity} {log.entityId && <small className="text-muted">({log.entityId.slice(-6)})</small>}</td>
                                            <td>
                                                {log.details && <pre className="small bg-light p-2 rounded m-0" style={{maxHeight: '100px', overflow: 'auto', whiteSpace: 'pre-wrap'}}>
                                                    {JSON.stringify(log.details, null, 2)}
                                                </pre>}
                                            </td>
                                            <td>{log.ipAddress}</td>
                                            <td className="text-center">{getStatusBadge(log.status)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="7" className="text-center py-5 text-muted">Aucun journal trouvé pour les filtres sélectionnés.</td></tr>
                                )}
                            </tbody>
                        </Table>
                    )}
                    {totalPages > 1 && (
                        <div className="d-flex justify-content-center p-3 border-top">
                            <Pagination className="mb-0">
                                <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                                {[...Array(totalPages)].map((_, idx) => (
                                    <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>
                                        {idx + 1}
                                    </Pagination.Item>
                                ))}
                                <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                            </Pagination>
                        </div>
                    )}
                </Card.Body>
            </Card>
        </div>
    );
};

export default AuditLogView;