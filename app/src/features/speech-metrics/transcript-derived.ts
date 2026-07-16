export interface Utterance {
  id: string;
  session_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
  sequence_index: number;
  created_at: Date;
}

const FILLER_TOKENS = new Set(["um", "uh", "hm", "mm", "erm"]);

export function computeMTLD(words: string[]): number {
  if (words.length === 0) return 0;

  const threshold = 0.72;

  const calculateMTLDSingleDirection = (wordList: string[]): number => {
    let factorCount = 0;
    let uniqueWords = new Set<string>();
    let totalWordsInFactor = 0;

    for (let i = 0; i < wordList.length; i++) {
      const word = wordList[i];
      uniqueWords.add(word);
      totalWordsInFactor++;

      const ttr = uniqueWords.size / totalWordsInFactor;

      if (ttr < threshold) {
        factorCount++;
        uniqueWords.clear();
        totalWordsInFactor = 0;
      }
    }

    if (totalWordsInFactor > 0) {
      const finalTTR = uniqueWords.size / totalWordsInFactor;
      const fractionalPart = finalTTR < 1.0 ? (1 - finalTTR) / (1 - threshold) : 0;
      factorCount += fractionalPart;
    }

    if (factorCount === 0) return wordList.length;
    return wordList.length / factorCount;
  };

  const forwardScore = calculateMTLDSingleDirection(words);
  const backwardScore = calculateMTLDSingleDirection([...words].reverse());

  return Math.round(((forwardScore + backwardScore) / 2) * 100) / 100;
}

export function computeLayerC(utterances: Utterance[], sessionDurationSeconds: number) {
  const words = utterances.flatMap((u) =>
    u.text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
      .split(/\s+/)
      .filter(Boolean)
  );

  const speakingTimeMs = utterances.reduce((sum, u) => sum + (u.end_ms - u.start_ms), 0);
  const participationPct = sessionDurationSeconds > 0
    ? Math.round((speakingTimeMs / (sessionDurationSeconds * 1000)) * 100 * 100) / 100
    : 0;

  const fillerCount = words.filter((w) => FILLER_TOKENS.has(w)).length;
  const fillerRate = words.length > 0
    ? Math.round((fillerCount / words.length) * 100 * 100) / 100
    : 0;

  const wpm = speakingTimeMs > 0
    ? Math.round((words.length / (speakingTimeMs / 60000)) * 10) / 10
    : 0;

  const turnsCount = utterances.length;
  const avgTurnMs = turnsCount > 0
    ? Math.round((speakingTimeMs / turnsCount) * 10) / 10
    : 0;

  const vocabMtldScore = words.length >= 50 ? computeMTLD(words) : null;

  return {
    speaking_time_ms: speakingTimeMs,
    participation_pct: participationPct,
    word_count: words.length,
    wpm: wpm,
    filler_count: fillerCount,
    filler_rate: fillerRate,
    turns_count: turnsCount,
    avg_turn_ms: avgTurnMs,
    vocab_mtld_score: vocabMtldScore,
  };
}
