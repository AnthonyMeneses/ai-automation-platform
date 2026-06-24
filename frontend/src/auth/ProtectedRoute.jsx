import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Loading from '../components/Loading';

export default function ProtectedRoute({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <Loading full />;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}
