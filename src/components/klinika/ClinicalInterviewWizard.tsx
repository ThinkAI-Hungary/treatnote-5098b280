import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { cn } from '@/lib/utils';
import {
  ArrowRight, ArrowLeft, Loader2, Check, X,
  Sparkles, Mic, MicOff, ChevronDown, ChevronRight,
  RotateCcw, CheckCircle2, XCircle, Plus, Minus,
  MessageSquare
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

interface ClinicalQuestion {
  id: string;
  title: string;
  subtitle: string;
  type: 'single' | 'multi' | 'freetext';
  options: QuestionOption[];
  allowFreeText: boolean;
  conditionalOn?: string;
  conditionalValues?: string[];
}

interface Answer {
  selected: string | string[];
  freeText?: string;
}

interface ProposedOverride {
  protocol_slug: string;
  is_disabled: boolean;
  excluded_actions: string[];
  added_actions: string[];
  reason_hu: string;
  // UI state
  accepted?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Voice Input Hook (ElevenLabs Scribe via Edge Function)
// ═══════════════════════════════════════════════════════════════

function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 100) {
          setListening(false);
          return;
        }

        // Send to ElevenLabs via Edge Function
        setProcessing(true);
        try {
          const formData = new FormData();
          formData.append('audio', blob, 'voice_answer.webm');

          const { data, error } = await supabase.functions.invoke('v2-quick-stt', {
            body: formData,
          });

          if (error) throw error;
          if (data?.transcript) {
            onResult(data.transcript);
          }
        } catch (err) {
          console.error('STT error:', err);
          toast.error('Hangfelismerési hiba — próbálja újra');
        } finally {
          setProcessing(false);
          setListening(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setListening(true);
    } catch (err) {
      console.error('Microphone error:', err);
      toast.error('Mikrofon nem elérhető');
    }
  }, [onResult]);

  const stopListening = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  return { listening, processing, startListening, stopListening };
}

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════

interface ClinicalInterviewWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string;
  onComplete?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function ClinicalInterviewWizard({ open, onOpenChange, telephelyId, onComplete }: ClinicalInterviewWizardProps) {
  // State
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<ClinicalQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<'questions' | 'processing' | 'review'>('questions');

  // Review state
  const [overrides, setOverrides] = useState<ProposedOverride[]>([]);
  const [summary, setSummary] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<string | null>(null);

  // ── Fetch questions ──
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPhase('questions');
    setCurrentIndex(0);

    supabase.functions.invoke('v2-clinical-interview', {
      body: { operation: 'get-questions', telephelyId },
    }).then(({ data, error }) => {
      if (error) { toast.error('Hiba a kérdések betöltésekor'); return; }
      setQuestions(data.questions || []);
      // Restore previous answers if re-running
      if (data.previousAnswers) {
        setAnswers(data.previousAnswers);
      }
      setLoading(false);
    });
  }, [open, telephelyId]);

  // ── Filter visible questions based on conditional logic ──
  const visibleQuestions = useMemo(() => {
    return questions.filter(q => {
      if (!q.conditionalOn) return true;
      const depAnswer = answers[q.conditionalOn];
      if (!depAnswer) return false;
      const selected = Array.isArray(depAnswer.selected) ? depAnswer.selected : [depAnswer.selected];
      return q.conditionalValues?.some(v => selected.includes(v)) ?? true;
    });
  }, [questions, answers]);

  const currentQuestion = visibleQuestions[currentIndex];
  const totalSteps = visibleQuestions.length;
  const isLastQuestion = currentIndex === totalSteps - 1;

  // ── Answer handlers ──
  const setAnswer = useCallback((questionId: string, answer: Answer) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  const selectOption = useCallback((questionId: string, optionId: string, type: 'single' | 'multi') => {
    setAnswers(prev => {
      const existing = prev[questionId];
      if (type === 'single') {
        return { ...prev, [questionId]: { ...existing, selected: optionId, freeText: existing?.freeText } };
      }
      // Multi-select toggle
      const currentSelection = Array.isArray(existing?.selected) ? existing.selected : [];
      const newSelection = currentSelection.includes(optionId)
        ? currentSelection.filter(s => s !== optionId)
        : [...currentSelection, optionId];
      return { ...prev, [questionId]: { ...existing, selected: newSelection, freeText: existing?.freeText } };
    });
  }, []);

  const setFreeText = useCallback((questionId: string, text: string) => {
    setAnswers(prev => {
      const existing = prev[questionId] || { selected: '' };
      return { ...prev, [questionId]: { ...existing, freeText: text } };
    });
  }, []);

  // ── Navigation ──
  const goNext = useCallback(() => {
    if (isLastQuestion) {
      // Process answers
      processAnswers();
    } else {
      setCurrentIndex(i => Math.min(i + 1, totalSteps - 1));
    }
  }, [isLastQuestion, totalSteps]);

  const goBack = useCallback(() => {
    if (phase === 'review') {
      setPhase('questions');
      return;
    }
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, [phase]);

  // ── Process answers via LLM ──
  const processAnswers = useCallback(async () => {
    setPhase('processing');
    try {
      const { data, error } = await supabase.functions.invoke('v2-clinical-interview', {
        body: { operation: 'process-answers', telephelyId, answers },
      });
      if (error) throw error;

      // Initialize all overrides as accepted
      const overridesWithState = (data.overrides || []).map((o: any) => ({
        ...o,
        accepted: true,
      }));
      setOverrides(overridesWithState);
      setSummary(data.summary || []);
      setPhase('review');
    } catch (err: any) {
      toast.error('Hiba a feldolgozás során: ' + (err.message || ''));
      setPhase('questions');
    }
  }, [telephelyId, answers]);

  // ── Toggle override acceptance in review ──
  const toggleOverride = useCallback((slug: string) => {
    setOverrides(prev => prev.map(o =>
      o.protocol_slug === slug ? { ...o, accepted: !o.accepted } : o
    ));
  }, []);

  // ── Save accepted overrides ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const acceptedOverrides = overrides.filter(o => o.accepted);
      const { error } = await supabase.functions.invoke('v2-clinical-interview', {
        body: {
          operation: 'save-overrides',
          telephelyId,
          answers,
          overrides: acceptedOverrides,
        },
      });
      if (error) throw error;

      toast.success(`Protokollok testreszabva! (${acceptedOverrides.length} módosítás mentve)`);
      onOpenChange(false);
      onComplete?.();
    } catch (err: any) {
      toast.error('Mentési hiba: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  }, [overrides, telephelyId, answers, onOpenChange, onComplete]);

  // ── Skip ──
  const handleSkip = useCallback(async () => {
    try {
      await supabase.functions.invoke('v2-clinical-interview', {
        body: { operation: 'save-overrides', telephelyId, answers: {}, overrides: [] },
      });
      toast.info('Alapbeállítások megtartva — bármikor újrafuttatható');
      onOpenChange(false);
      onComplete?.();
    } catch { /* ignore */ }
  }, [telephelyId, onOpenChange, onComplete]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Klinikai interjú</h2>
              <p className="text-sm text-muted-foreground">
                {phase === 'questions' ? 'Meséljen a rendelőjéről — az AI testreszabja a protokollokat' :
                 phase === 'processing' ? 'Protokollok konfigurálása...' :
                 'Tekintse át a javasolt módosításokat'}
              </p>
            </div>
          </div>
          {/* Progress */}
          {phase === 'questions' && totalSteps > 0 && (
            <div className="flex items-center gap-1.5 mt-4">
              {visibleQuestions.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all duration-300",
                    i < currentIndex ? "bg-primary" :
                    i === currentIndex ? "bg-primary animate-pulse" :
                    "bg-muted"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : phase === 'questions' && currentQuestion ? (
            <QuestionCard
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              onSelectOption={(optionId) => selectOption(currentQuestion.id, optionId, currentQuestion.type)}
              onSetFreeText={(text) => setFreeText(currentQuestion.id, text)}
            />
          ) : phase === 'processing' ? (
            <ProcessingView />
          ) : phase === 'review' ? (
            <ReviewView
              overrides={overrides}
              summary={summary}
              expandedOverride={expandedOverride}
              onExpandOverride={setExpandedOverride}
              onToggleOverride={toggleOverride}
            />
          ) : null}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t bg-muted/30 flex items-center gap-3">
          {phase === 'questions' ? (
            <>
              {currentIndex === 0 ? (
                <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                  Kihagyás
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Előző
                </Button>
              )}
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">{currentIndex + 1} / {totalSteps}</span>
              <Button
                onClick={goNext}
                disabled={!currentQuestion || (!answers[currentQuestion.id]?.selected && !answers[currentQuestion.id]?.freeText)}
                className="gap-2"
              >
                {isLastQuestion ? (
                  <><Sparkles className="h-4 w-4" />Protokollok generálása</>
                ) : (
                  <><ArrowRight className="h-4 w-4" />Következő</>
                )}
              </Button>
            </>
          ) : phase === 'review' ? (
            <>
              <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Vissza a kérdésekhez
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">
                {overrides.filter(o => o.accepted).length}/{overrides.length} módosítás elfogadva
              </span>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Mentés...</>
                ) : (
                  <><Check className="h-4 w-4" />Mentés és alkalmazás</>
                )}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fuzzy option matcher
// ═══════════════════════════════════════════════════════════════

function normalizeHu(s: string): string {
  return s.toLowerCase()
    .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/[ő]/g, 'o').replace(/[ű]/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchOptionByVoice(transcript: string, options: QuestionOption[]): QuestionOption | null {
  const norm = normalizeHu(transcript);
  const words = norm.split(' ');

  let bestMatch: QuestionOption | null = null;
  let bestScore = 0;
  const allMatches: { opt: QuestionOption; score: number }[] = [];

  for (const opt of options) {
    const optNorm = normalizeHu(opt.label + ' ' + (opt.description || ''));
    const optWords = optNorm.split(' ');

    // Count how many transcript words appear in this option's text
    let hits = 0;
    for (const w of words) {
      if (w.length < 2) continue;
      if (optWords.some(ow => ow.includes(w) || w.includes(ow))) hits++;
    }

    const meaningfulWords = words.filter(w => w.length >= 2).length || 1;
    const score = hits / meaningfulWords;

    if (score >= 0.25) {
      allMatches.push({ opt, score });
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = opt;
    }
  }

  return {
    best: bestScore >= 0.3 ? bestMatch : null,
    all: allMatches.sort((a, b) => b.score - a.score).map(m => m.opt),
  };
}

// ═══════════════════════════════════════════════════════════════
// Question Card
// ═══════════════════════════════════════════════════════════════

function QuestionCard({
  question, answer, onSelectOption, onSetFreeText,
}: {
  question: ClinicalQuestion;
  answer?: Answer;
  onSelectOption: (optionId: string) => void;
  onSetFreeText: (text: string) => void;
}) {
  const [showFreeText, setShowFreeText] = useState(!!answer?.freeText);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const isSelected = (optionId: string) => {
    if (!answer) return false;
    return Array.isArray(answer.selected)
      ? answer.selected.includes(optionId)
      : answer.selected === optionId;
  };

  // Voice input: match options — multi-select picks all matches, single picks best
  const handleVoiceResult = useCallback((text: string) => {
    const { best, all } = matchOptionByVoice(text, question.options);

    if (question.type === 'multi' && all.length > 0) {
      // Select ALL matched options for multi-select questions
      for (const opt of all) {
        onSelectOption(opt.id);
      }
      const labels = all.map(o => o.label).join(', ');
      setVoiceHint(`"${text}" → ${labels}`);
      setTimeout(() => setVoiceHint(null), 4000);
    } else if (best) {
      // Single-select: pick best match
      onSelectOption(best.id);
      setVoiceHint(`"${text}" → ${best.label}`);
      setTimeout(() => setVoiceHint(null), 3000);
    } else {
      // No match — put in free text
      onSetFreeText((answer?.freeText ? answer.freeText + ' ' : '') + text);
      setShowFreeText(true);
      setVoiceHint(`"${text}" — megjegyzésként rögzítve`);
      setTimeout(() => setVoiceHint(null), 3000);
    }
  }, [question.options, question.type, answer?.freeText, onSelectOption, onSetFreeText]);

  const { listening, processing, startListening, stopListening } = useVoiceInput(handleVoiceResult);

  return (
    <div className="space-y-4">
      {/* Question + voice button */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold tracking-tight">{question.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{question.subtitle}</p>
        </div>
        <button
          onClick={listening ? stopListening : startListening}
          disabled={processing}
          className={cn(
            "flex-shrink-0 h-11 w-11 rounded-xl flex items-center justify-center transition-all",
            listening
              ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
              : processing
              ? "bg-muted/60 text-muted-foreground border border-muted cursor-wait"
              : "bg-muted/60 hover:bg-primary/10 text-muted-foreground hover:text-primary border border-muted"
          )}
          title={listening ? "Leállítás" : processing ? "Feldolgozás..." : "Válaszoljon hanggal"}
        >
          {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
      </div>

      {/* Voice feedback */}
      {listening && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600">
          <Mic className="h-3.5 w-3.5 animate-pulse" />
          <span className="text-xs">Figyelek... mondja el a válaszát, majd nyomja meg újra a gombot</span>
        </div>
      )}
      {processing && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Hangfelismerés folyamatban...</span>
        </div>
      )}
      {voiceHint && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-primary">
          <Check className="h-3.5 w-3.5" />
          <span className="text-xs">{voiceHint}</span>
        </div>
      )}

      {/* Options */}
      <div className="space-y-2">
        {question.options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelectOption(opt.id)}
            className={cn(
              "w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-200 hover:shadow-sm",
              isSelected(opt.id)
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-muted hover:border-primary/30"
            )}
          >
            {/* Selection indicator */}
            <div className={cn(
              "mt-0.5 flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
              isSelected(opt.id)
                ? "border-primary bg-primary"
                : "border-muted-foreground/30",
              question.type === 'multi' && "rounded-md"
            )}>
              {isSelected(opt.id) && <Check className="h-3 w-3 text-white" />}
            </div>

            {/* Text */}
            <div className="min-w-0">
              <div className="font-medium text-sm">{opt.label}</div>
              {opt.description && (
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{opt.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Free text area */}
      {question.allowFreeText && (
        <div className="pt-1">
          {!showFreeText ? (
            <button
              onClick={() => setShowFreeText(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <MessageSquare className="h-3 w-3" />
              Egyéb megjegyzés hozzáadása...
            </button>
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Megjegyzés / egyéb:</span>
              <Textarea
                value={answer?.freeText || ''}
                onChange={(e) => onSetFreeText(e.target.value)}
                placeholder="Pl.: Nálunk a gyökérkezelésnél mindig mikroszkópot használunk..."
                className="min-h-[60px] text-sm resize-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Processing View
// ═══════════════════════════════════════════════════════════════

function ProcessingView() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/20">
          <Sparkles className="h-8 w-8 text-white animate-pulse" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping" />
      </div>
      <div className="text-center">
        <h3 className="font-bold text-lg">Protokollok testreszabása...</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Az AI elemzi a válaszait és módosítja a protokollokat
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Review View
// ═══════════════════════════════════════════════════════════════

function ReviewView({
  overrides, summary, expandedOverride, onExpandOverride, onToggleOverride,
}: {
  overrides: ProposedOverride[];
  summary: string[];
  expandedOverride: string | null;
  onExpandOverride: (slug: string | null) => void;
  onToggleOverride: (slug: string) => void;
}) {
  const accepted = overrides.filter(o => o.accepted).length;
  const disabled = overrides.filter(o => o.is_disabled && o.accepted).length;
  const modified = overrides.filter(o => !o.is_disabled && o.accepted).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          A válaszai alapján {overrides.length} módosítást javaslunk
        </h3>
        {summary.length > 0 && (
          <ul className="mt-2 space-y-1">
            {summary.map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Check className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3 mt-3 text-[10px] text-muted-foreground">
          {disabled > 0 && <span>{disabled} protokoll kikapcsolva</span>}
          {modified > 0 && <span>{modified} protokoll módosítva</span>}
        </div>
      </div>

      {/* Override list */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Kattintson egy módosításra a részletekért. A ✓ gombbal elfogadhatja vagy elutasíthatja.
        </p>
        {overrides.map(override => {
          const isExpanded = expandedOverride === override.protocol_slug;
          return (
            <div
              key={override.protocol_slug}
              className={cn(
                "border rounded-lg overflow-hidden transition-all",
                !override.accepted && "opacity-40"
              )}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors">
                {/* Accept/reject toggle */}
                <button
                  onClick={() => onToggleOverride(override.protocol_slug)}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
                    override.accepted ? "border-primary bg-primary" : "border-muted-foreground/30"
                  )}
                >
                  {override.accepted && <Check className="h-3 w-3 text-white" />}
                </button>

                {/* Info */}
                <button
                  onClick={() => onExpandOverride(isExpanded ? null : override.protocol_slug)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{override.protocol_slug.replace(/_/g, ' ')}</span>
                    {override.is_disabled && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 flex-shrink-0">
                        kikapcsolva
                      </Badge>
                    )}
                    {!override.is_disabled && override.excluded_actions.length > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400 text-amber-600 flex-shrink-0">
                        <Minus className="h-2 w-2 mr-0.5" />{override.excluded_actions.length}
                      </Badge>
                    )}
                    {!override.is_disabled && override.added_actions.length > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-green-400 text-green-600 flex-shrink-0">
                        <Plus className="h-2 w-2 mr-0.5" />{override.added_actions.length}
                      </Badge>
                    )}
                  </div>
                </button>

                {/* Expand */}
                <button
                  onClick={() => onExpandOverride(isExpanded ? null : override.protocol_slug)}
                  className="p-0.5 flex-shrink-0"
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0.5 border-t bg-muted/10">
                  <p className="text-xs text-muted-foreground italic mb-2">{override.reason_hu}</p>
                  {override.excluded_actions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      <span className="text-[10px] text-muted-foreground mr-1">Eltávolítva:</span>
                      {override.excluded_actions.map(a => (
                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 line-through">
                          {a.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                  {override.added_actions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[10px] text-muted-foreground mr-1">Hozzáadva:</span>
                      {override.added_actions.map(a => (
                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                          + {a.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
