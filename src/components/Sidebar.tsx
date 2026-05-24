import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ClipboardList,
  MapPin, 
  Users, 
  RotateCcw, 
  FileText, 
  HelpCircle, 
  LogOut,
  BarChart3,
  Clock,
  Pin,
  PinOff,
  UserCircle,
  Mail
} from 'lucide-react';
import { auth } from '../firebase/config';
import { useLpo } from '../context/LpoContext';

const Sidebar: React.FC = () => {
  const { isSidebarPinned, setIsSidebarPinned, parent, isAdmin, userData, awaitingTcCount, companyName } = useLpo();
  const [isHovered, setIsHovered] = useState(false);

  // The sidebar is visually expanded if it's either pinned OR being hovered over
  const isExpanded = isSidebarPinned || isHovered;

  const navItems = [
    { name: 'Job Manager', icon: ClipboardList, path: '/dashboard' },
    { 
      name: 'Awaiting T&C', 
      icon: Clock, 
      path: '/awaiting-tc',
      hidden: userData?.role === 'customer' 
    },
    { name: 'Recurring Schedules', icon: RotateCcw, path: '/schedules' },
    { 
      name: userData?.role === 'customer' ? 'Address Book' : 'Customer Hub', 
      icon: Users, 
      path: '/customers' 
    },
    { name: 'Invoices', icon: FileText, path: '/invoices' },
    { name: 'Operational Insights', icon: BarChart3, path: '/reports' },
    { name: 'Service Area', icon: MapPin, path: '/service-area' },
    { name: 'My Profile', icon: UserCircle, path: '/profile' },
  ];

  const adminNavItems = [
    { name: 'User Management', icon: Users, path: '/admin/users' },
    { name: 'Communications', icon: Mail, path: '/admin/communications' },
  ];

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = '/signin';
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSidebarPinned(!isSidebarPinned);
  };

  return (
    <aside 
      className={`sidebar-premium ${!isExpanded ? 'collapsed' : ''} ${isSidebarPinned ? 'pinned' : 'unpinned'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="sidebar-mesh"></div>

      <div className="sidebar-content">
        <div className="sidebar-header">
          <div className="brand-redesign">
            <div className="logo-text">
              {!isExpanded ? (
                <><span className="logo-lpo">LM</span><span className="logo-plus">+</span></>
              ) : (
                <><span className="logo-lpo">LocalMile</span><span className="logo-plus">.Plus</span></>
              )}
            </div>
            {isExpanded && (
              <div className="logo-platform">
                A MAILPLUS PLATFORM
              </div>
            )}
          </div>
          
          <NavLink to="/profile" className="user-profile-glass profile-link">
            <div className="avatar-ring">
              <div className="avatar-placeholder">
                {isAdmin ? 'AD' : (parent?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || 'CK')}
              </div>
            </div>
            {isExpanded && (
              <div className="user-info">
                <p className="user-name">
                  {userData?.first_name && userData?.last_name 
                    ? `${userData.first_name} ${userData.last_name}` 
                    : (userData?.email.split('@')[0] || 'Clarke Kent')}
                </p>
                {companyName && (
                  <p className="company-name" style={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', margin: '2px 0 0 0', whiteSpace: 'normal', wordBreak: 'break-word', maxWidth: '140px', lineHeight: '1.2' }}>{companyName}</p>
                )}
                {(isAdmin || userData?.role === 'parent') && (
                  <p className="lpo-name">{isAdmin ? 'Head Office Admin' : (parent?.name || 'Parent Account')}</p>
                )}
              </div>
            )}
          </NavLink>
        </div>
        
        <nav className="sidebar-nav" id="tour-sidebar">
          {isAdmin && (
            <div className="nav-group">
              {isExpanded && <p className="group-title">Head Office Admin</p>}
              {adminNavItems.map((item) => (
                <NavLink 
                  key={item.path} 
                  to={item.path}
                  title={!isExpanded ? item.name : ''}
                  className={({ isActive }) => `nav-item-glass ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={20} className="nav-icon" />
                  {isExpanded && <span>{item.name}</span>}
                </NavLink>
              ))}
            </div>
          )}

          <div className="nav-group">
            {isExpanded && <p className="group-title">Logistics Management</p>}
            {navItems.slice(0, 3).filter(item => !item.hidden).map((item) => (
              <NavLink 
                key={item.path} 
                to={item.path}
                title={!isExpanded ? item.name : ''}
                className={({ isActive }) => `nav-item-glass ${isActive ? 'active' : ''}`}
              >
                <item.icon size={20} className="nav-icon" />
                {isExpanded && <span>{item.name}</span>}
                {item.name === 'Awaiting T&C' && awaitingTcCount > 0 && (
                  <span className={`sidebar-badge ${!isExpanded ? 'collapsed-badge' : ''}`}>
                    {awaitingTcCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          <div className="nav-group">
            {isExpanded && <p className="group-title">Administration</p>}
            {navItems.slice(3).map((item) => (
              <NavLink 
                key={item.path} 
                to={item.path}
                title={!isExpanded ? item.name : ''}
                className={({ isActive }) => `nav-item-glass ${isActive ? 'active' : ''}`}
              >
                <item.icon size={20} className="nav-icon" />
                {isExpanded && <span>{item.name}</span>}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/help" className="nav-item-glass footer-item" id="tour-help" title={!isExpanded ? "Support Center" : ""}>
            <HelpCircle size={20} />
            {isExpanded && <span>Support Center</span>}
          </NavLink>
          <button className="nav-item-glass logout-btn" onClick={handleLogout} title={!isExpanded ? "Sign Out" : ""}>
            <LogOut size={20} />
            {isExpanded && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      {/* Option 1: The Edge Handle Toggle */}
      <div 
        className={`edge-handle ${isHovered ? 'visible' : ''}`} 
        onClick={togglePin}
        title={isSidebarPinned ? "Unpin Sidebar" : "Pin Sidebar"}
      >
        <div className="handle-glow"></div>
        <div className="handle-icon">
          {isSidebarPinned ? <PinOff size={14} /> : <Pin size={14} />}
        </div>
      </div>

      <style>{`
        .sidebar-premium {
          width: var(--sidebar-width);
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 1000;
          background: var(--sidebar-bg);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          transition: width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1);
          box-shadow: 10px 0 30px rgba(0,0,0,0.1);
        }

        .sidebar-premium.collapsed {
          width: var(--sidebar-collapsed-width);
          box-shadow: none;
        }

        .sidebar-premium.unpinned:not(.collapsed) {
          z-index: 1100; /* Float over content when expanded via hover but not pinned */
          border-right: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 20px 0 50px rgba(0,0,0,0.3);
        }

        .sidebar-mesh {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 0;
          filter: blur(40px);
          opacity: 0.4;
        }

        .sidebar-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .sidebar-header {
          padding: 32px 24px;
          transition: padding 0.4s;
        }

        .collapsed .sidebar-header {
          padding: 32px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* Edge Handle Styling */
        .edge-handle {
          position: absolute;
          right: 0;
          top: 0;
          width: 30px;
          height: 100%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1200;
          opacity: 0;
          transition: opacity 0.3s;
        }

        .edge-handle.visible {
          opacity: 1;
        }

        .handle-glow {
          position: absolute;
          right: 0;
          width: 4px;
          height: 60px;
          background: var(--gold);
          border-radius: 4px 0 0 4px;
          filter: blur(4px);
          opacity: 0.6;
          transition: height 0.3s, opacity 0.3s;
        }

        .edge-handle:hover .handle-glow {
          height: 120px;
          opacity: 1;
          filter: blur(6px);
        }

        .handle-icon {
          background: var(--gold);
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: translateX(12px);
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }

        .edge-handle:hover .handle-icon {
          transform: translateX(0);
        }

        .brand-redesign {
          margin-bottom: 40px;
          padding-left: 4px;
          transition: all 0.3s;
        }

        .collapsed .brand-redesign {
          padding-left: 0;
          margin-bottom: 32px;
          align-items: center;
        }
        
        .logo-text {
          font-size: 1.6rem;
          color: #ffffff;
        }

        .collapsed .logo-text {
          font-size: 2rem;
        }
        
        .logo-platform {
          white-space: nowrap;
        }

        .user-profile-glass {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 16px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.3s;
          text-decoration: none;
        }

        .profile-link:hover {
          background: rgba(255, 255, 255, 0.15);
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .collapsed .user-profile-glass {
          padding: 8px;
          border-radius: 50%;
        }

        .avatar-ring {
          padding: 3px;
          background: linear-gradient(45deg, var(--gold), #ffffff);
          border-radius: 50%;
          flex-shrink: 0;
        }
        .avatar-placeholder {
          width: 36px; height: 36px;
          background: white; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 0.75rem; color: var(--ink);
        }

        .user-name { 
          font-weight: 800; 
          font-size: 0.85rem; 
          color: #ffffff; 
          margin: 0; 
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }
        .lpo-name { 
          font-size: 0.65rem; 
          font-weight: 600; 
          color: rgba(255, 255, 255, 0.5); 
          margin: 0; 
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 140px;
        }

        .sidebar-nav {
          flex: 1;
          padding: 0 16px;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .collapsed .sidebar-nav {
          padding: 0 12px;
        }

        .nav-group {
          margin-bottom: 24px;
        }
        .group-title {
          font-family: var(--font-ui);
          font-size: 0.6rem; font-weight: 500; color: rgba(255, 255, 255, 0.3);
          text-transform: uppercase; letter-spacing: 0.16em;
          margin: 0 0 12px 16px;
        }

        .nav-item-glass {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.85rem; font-weight: 700;
          border-radius: 14px;
          margin-bottom: 4px;
          transition: all 0.2s;
          border: 1px solid transparent;
          white-space: nowrap;
        }

        .collapsed .nav-item-glass {
          justify-content: center;
          padding: 12px;
        }

        .nav-item-glass:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          transform: translateX(4px);
        }

        .collapsed .nav-item-glass:hover {
          transform: scale(1.1);
        }

        .nav-item-glass.active {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border-left: 4px solid var(--gold);
          border-radius: 0 14px 14px 0;
          margin-left: -16px;
          padding-left: 28px;
        }

        .collapsed .nav-item-glass.active {
          margin-left: 0;
          padding-left: 12px;
          border-left: none;
          background: rgba(168, 118, 58, 0.2);
          border: 1px solid var(--gold);
          border-radius: 14px;
        }

        .nav-item-glass.active .nav-icon { color: var(--gold); }

        .sidebar-badge {
          background: #ff4757;
          color: white;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 50px;
          margin-left: auto;
          box-shadow: 0 4px 10px rgba(255, 71, 87, 0.3);
          animation: badgeIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .collapsed-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          margin-left: 0;
          padding: 2px 5px;
          font-size: 0.6rem;
          min-width: 18px;
          text-align: center;
        }

        @keyframes badgeIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .sidebar-footer {
          padding: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.1);
        }

        .collapsed .sidebar-footer {
          padding: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .logout-btn {
          width: 100%; border: none; background: transparent; cursor: pointer;
        }
        .logout-btn:hover { background: rgba(229, 62, 62, 0.2); color: #feb2b2; }

        @media (max-width: 1024px) {
          .sidebar-premium { display: none; }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
