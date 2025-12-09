import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play } from 'lucide-react';
import { useState } from 'react';

export default function VoiceRecording() {
  const [isRecording, setIsRecording] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hangfelvétel</h1>
          <p className="text-muted-foreground mt-1">
            Vizsgálati jegyzőkönyv diktálása
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Hangfelvétel készítése</CardTitle>
            <CardDescription>
              Nyomja meg a mikrofon gombot a felvétel indításához
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-12">
            <Button
              size="lg"
              variant={isRecording ? 'destructive' : 'default'}
              className="h-24 w-24 rounded-full"
              onClick={() => setIsRecording(!isRecording)}
            >
              {isRecording ? (
                <Square className="h-10 w-10" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </Button>
            <p className="mt-4 text-muted-foreground">
              {isRecording ? 'Felvétel folyamatban...' : 'Kattintson a felvétel indításához'}
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
