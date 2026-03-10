import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { Stethoscope, ArrowRight, LogIn, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const galaxyStyle = {
  background: 'linear-gradient(to right, hsl(270 70% 60%), hsl(250 65% 55%), hsl(195 85% 50%))',
  color: 'white',
  border: 'none',
} as const;

const lightStyle = {
  background: 'linear-gradient(to right, hsl(268 30% 82%), hsl(263 22% 87%), hsl(255 12% 92%))',
  color: 'hsl(262 48% 16%)',
  border: '1px solid hsl(265 18% 87%)',
  boxShadow: '0 1px 3px hsl(265 20% 80% / 0.2)',
} as const;

const Index = () => {
  const { user } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const btnStyle = dark ? galaxyStyle : lightStyle;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Váltás világos módra' : 'Váltás sötét módra'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {user ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 h-9 transition-opacity hover:opacity-90"
              style={btnStyle}
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 h-9 transition-opacity hover:opacity-90"
                style={btnStyle}
              >
                <LogIn className="mr-2 h-4 w-4" />
                Bejelentkezés
              </Link>
              <Link
                to="/solo-register"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium px-4 py-2 h-9 transition-opacity hover:opacity-90"
                style={btnStyle}
              >
                Regisztráció
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-20 pb-24 max-w-4xl mx-auto">
        <h1 className={`text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-6 ${dark ? 'hero-title-dark' : 'hero-title-light'}`}>
          Az okos fogorvosi<br />dokumentációs rendszer
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mb-10">
          A TreatNote összeköti praxisának napi munkáját: betegnyilvántartás, Flexi-Dent integráció és
          AI-alapú segítség – egyetlen letisztult felületen.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/solo-register"
            className="inline-flex items-center justify-center rounded-md text-base font-medium px-8 py-3 transition-opacity hover:opacity-90"
            style={btnStyle}
          >
            Kezdem ingyen
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md text-base font-medium px-8 py-3 transition-opacity hover:opacity-90"
            style={btnStyle}
          >
            Már van fiókom
          </Link>
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
