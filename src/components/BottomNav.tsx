import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  Users, 
  LayoutDashboard, 
  RotateCcw, 
  HelpCircle,
  LogOut 
} from 'lucide-react';
import { auth } from '../firebase/config';

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const navItems = [
    { name: 'Customers', icon: Users, path: '/customers' },
    { name: 'Schedules', icon: RotateCcw, path: '/schedules' },
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Support', icon: HelpCircle, path: '/help' },
  ];

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/signin');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <NavLink 
          key={item.path} 
          to={item.path}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <item.icon size={20} />
          <span>{item.name}</span>
        </NavLink>
      ))}
      
      <button className="bottom-nav-item logout-btn" onClick={handleLogout}>
        <LogOut size={20} />
        <span>Logout</span>
      </button>

      <style>{`
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: var(--bottom-nav-height);
          background: var(--sidebar-bg);
          display: flex;
          justify-content: space-around;
          align-items: center;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 1000;
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -10px 30px rgba(0,0,0,0.1);
        }

        .bottom-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          color: rgba(255, 255, 255, 0.6);
          text-decoration: none;
          font-family: var(--font-ui);
          font-size: 0.55rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          flex: 1;
          background: none;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }

        .bottom-nav-item.active {
          color: #ffffff;
        }
        
        .bottom-nav-item.active svg {
          color: var(--yellow);
        }

        .bottom-nav-item svg {
          transition: transform 0.2s;
        }

        .bottom-nav-item.active svg {
          transform: translateY(-2px);
        }

        @media (min-width: 768px) {
          .bottom-nav {
            display: none;
          }
        }
      `}</style>
    </nav>
  );
};

export default BottomNav;
