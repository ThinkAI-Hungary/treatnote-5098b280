import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { StarField } from '@/components/klinika/StarField';
import { Stethoscope, ArrowRight, LogIn, Moon, Sun } from 'lucide-react';


const Index = () => {
  const { user } = useAuth();

  // Initialise from the current <html> class (set by the rest of the app)
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [dark]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Star field only in light mode */}
      {!dark && <StarField />}

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Stethoscope className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            TreatNote
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDark(d => !d)}
            aria-label={dark ? 'Váltás világos módra' : 'Váltás sötét módra'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {user ? (
            <Button asChild className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/auth">
                  <LogIn className="mr-2 h-4 w-4" />
                  Bejelentkezés
                </Link>
              </Button>
              <Button asChild className="bg-gradient-to-r from-primary to-accent hover:opacity-90">
                <Link to="/solo-register">Regisztráció</Link>
              </Button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-br from-foreground via-foreground/80 to-primary bg-clip-text text-transparent leading-tight mb-6">
          Az okos fogorvosi<br />dokumentációs rendszer
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mb-10">
          A TreatNote összeköti praxisának napi munkáját: betegnyilvántartás, Flexi-Dent integráció és
          AI-alapú segítség – egyetlen letisztult felületen.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" asChild className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-base px-8">
            <Link to="/solo-register">
              Kezdem ingyen
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="border-primary/30 hover:bg-primary/5 text-base px-8">
            <Link to="/auth">Már van fiókom</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <section className="relative z-10 border-t border-primary/10 py-12 text-center px-6">
        <p className="text-muted-foreground text-sm">
          © {new Date().getFullYear()} TreatNote · Minden jog fenntartva
        </p>
      </section>
    </div>
  );
};

export default Index;
