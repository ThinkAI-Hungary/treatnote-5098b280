import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('type=email_confirmation') || hash.includes('type=recovery')) {
      navigate(`/auth${hash}`, { replace: true });
      return;
    }

    if (user) {
      if (user.email === 'zoli@thinkai.hu') {
        navigate('/zoli-chart', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } else {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  return null;
};

export default Index;
