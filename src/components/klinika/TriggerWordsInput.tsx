import { useState, useCallback, KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TriggerWordsInputProps {
  value: string[];
  onChange: (words: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TriggerWordsInput({ 
  value, 
  onChange, 
  placeholder = 'Új trigger szó...', 
  className 
}: TriggerWordsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addWord = useCallback(() => {
    const trimmed = inputValue.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInputValue('');
    }
  }, [inputValue, value, onChange]);

  const removeWord = useCallback((wordToRemove: string) => {
    onChange(value.filter(w => w !== wordToRemove));
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWord();
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeWord(value[value.length - 1]);
    }
  }, [addWord, inputValue, value, removeWord]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2 min-h-[32px]">
        {value.map((word) => (
          <Badge
            key={word}
            variant="secondary"
            className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            {word}
            <button
              type="button"
              onClick={() => removeWord(word)}
              className="ml-1 rounded-full hover:bg-primary/30 p-0.5 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addWord}
          disabled={!inputValue.trim()}
          className="h-9 px-3"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
