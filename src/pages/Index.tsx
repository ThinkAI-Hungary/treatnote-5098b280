import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowRight, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Ha be van jelentkezve, azonnal a dashboardra irányítjuk
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('type=email_confirmation') || hash.includes('type=recovery')) {
      navigate(`/auth${hash}`, { replace: true });
      return;
    }

    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);



  // Betöltés alatt ne villanjon fel a landing page
  if (user) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-cyan-950 via-slate-900 to-blue-950">
      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center">
            <img src="/MOLaiRE.svg" alt="MOLaiRE" className="h-8 brightness-0 invert" />
          </div>
          <span className="text-[10px] font-medium text-emerald-100/60 uppercase tracking-widest pl-1">
            Powered by TreatNote
          </span>
        </div>
        <div className="flex items-center gap-3">

          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 h-9 transition-all bg-gradient-to-r from-cyan-500 to-cyan-400 text-white shadow-sm hover:shadow-md hover:from-cyan-600 hover:to-cyan-500"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 h-9 transition-all bg-gradient-to-r from-cyan-500 to-cyan-400 text-white shadow-sm hover:shadow-md hover:from-cyan-600 hover:to-cyan-500"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Bejelentkezés
              </Link>
              <Link
                to="/solo-register"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 h-9 transition-all bg-gradient-to-r from-cyan-500 to-cyan-400 text-white shadow-sm hover:shadow-md hover:from-cyan-600 hover:to-cyan-500"
              >
                Regisztráció
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6 text-white">
          Az okos fogorvosi<br />dokumentációs rendszer
        </h1>
        <p className="text-lg text-blue-100/80 max-w-2xl mb-10">
          A TreatNote összeköti praxisának napi munkáját: betegnyilvántartás, Flexi-Dent integráció és
          AI-alapú segítség – egyetlen letisztult felületen.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/solo-register"
            className="inline-flex items-center justify-center rounded-md text-base font-medium px-8 py-3 transition-all bg-gradient-to-r from-cyan-500 to-cyan-400 text-white shadow-md hover:shadow-lg hover:from-cyan-600 hover:to-cyan-500"
          >
            Kezdem ingyen
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md text-base font-medium px-8 py-3 transition-all bg-white/10 text-white border border-white/20 shadow-sm hover:bg-white/20"
          >
            Már van fiókom
          </Link>
        </div>
      </section>

      {/* Footer */}
      <section className="relative z-10 border-t border-white/10 py-12 text-center px-6">
        <p className="text-white/40 text-sm">
          © {new Date().getFullYear()} TreatNote · Minden jog fenntartva
        </p>
      </section>
    </div>
  );
};

export default Index;
