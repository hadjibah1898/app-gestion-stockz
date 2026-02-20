// src/components/common/Sidebar.js
import React from 'react';
import { NavLink } from 'react-router-dom'; // Import NavLink
import './Sidebar.css';

const Sidebar = ({ userRole }) => {
    // Le menu s'adapte en fonction du rôle de l'utilisateur

    return (
        <aside className="left-sidebar">
            {/* Logo Section */}
            <div className="brand-logo">
                {/* Remplacez par votre <img> si nécessaire */}
                <h3 className="m-0 text-primary fw-bold d-flex align-items-center">
                    <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2"></iconify-icon>
                    AdminDash
                </h3>
            </div>

            {/* Navigation Section */}
            <nav className="sidebar-nav scroll-sidebar">
                {userRole === 'Admin' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin" end>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Gestion</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/managers">
                                <iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Gérants</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/shops">
                                <iconify-icon icon="solar:shop-2-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Boutiques</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/articles">
                                 <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Articles</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/etat-stock">
                                 <iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon>
                                <span className="hide-menu">État des stocks</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/fournisseurs">
                                 <iconify-icon icon="solar:delivery-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Fournisseurs</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/centrale">
                                 <iconify-icon icon="solar:box-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Boutique Centrale</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/mouvements">
                                <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mouvements Stock</span>
                            </NavLink>
                        </li>
                         <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/ventes">
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                    </ul>
                ) : ( // Vue pour le Gérant
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant" end>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/ventes">
                                <iconify-icon icon="solar:cart-4-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Effectuer une Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/articles">
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Consulter le Stock</span>
                            </NavLink>
                        </li>
                    </ul>
                )}
            </nav>
        </aside>
    );
};


export default Sidebar;