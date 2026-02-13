import React, { useState } from 'react';

const LoginPage = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const apiUrl = process.env.REACT_APP_API_URL;
        if (!apiUrl) {
            setError("Erreur de configuration : L'URL de l'API n'est pas définie. Vérifiez le fichier .env et redémarrez le serveur.");
            setLoading(false);
            return;
        }

        try {
            // Appel à l'API de connexion
            const response = await fetch(`${apiUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Stockage du token et des infos utilisateur
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify({ nom: data.nom, role: data.role }));
                onLogin(data);
            } else {
                setError(data.message || "Identifiants incorrects");
            }
        } catch (err) {
            console.error(err);
            setError("Impossible de contacter le serveur. Vérifiez que le backend est lancé.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
            <div className="card shadow-lg border-0" style={{ maxWidth: '400px', width: '100%' }}>
                <div className="card-body p-5">
                    <div className="text-center mb-4">
                        <i className="bi bi-speedometer2 text-primary" style={{ fontSize: '3rem' }}></i>
                        <h3 className="mt-2 fw-bold" style={{ color: '#4361ee' }}>StockMaster</h3>
                        <p className="text-muted">Connectez-vous à votre espace</p>
                    </div>

                    {error && <div className="alert alert-danger text-center" role="alert">{error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label htmlFor="email" className="form-label">Adresse Email</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light border-end-0"><i className="bi bi-envelope"></i></span>
                                <input 
                                    type="email" 
                                    className="form-control border-start-0 ps-0" 
                                    id="email" 
                                    placeholder="nom@exemple.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required 
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label htmlFor="password" className="form-label">Mot de passe</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light border-end-0"><i className="bi bi-lock"></i></span>
                                <input 
                                    type="password" 
                                    className="form-control border-start-0 ps-0" 
                                    id="password" 
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required 
                                />
                            </div>
                        </div>
                        <div className="d-grid">
                            <button type="submit" className="btn btn-primary py-2" disabled={loading}>
                                {loading ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                        Connexion...
                                    </>
                                ) : (
                                    "Se connecter"
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;