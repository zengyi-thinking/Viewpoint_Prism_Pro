import {
  deriveKnowledgeBoardState,
  KnowledgeBoardState,
  parseTimestampToSeconds,
} from './knowledge-board.contract';

describe('KnowledgeBoardContract', () => {
  it('should derive idle state', () => {
    expect(
      deriveKnowledgeBoardState({
        transcriptStatus: 'PENDING',
        keyframeStatus: 'PENDING',
        assetStatus: 'PENDING',
      }),
    ).toBe(KnowledgeBoardState.IDLE);
  });

  it('should derive analyzing state', () => {
    expect(
      deriveKnowledgeBoardState({
        transcriptStatus: 'PROCESSING',
        keyframeStatus: 'PENDING',
        assetStatus: 'PENDING',
      }),
    ).toBe(KnowledgeBoardState.ANALYZING);
  });

  it('should derive streaming state when partial data exists', () => {
    expect(
      deriveKnowledgeBoardState({
        transcriptStatus: 'PROCESSING',
        keyframeStatus: 'PENDING',
        assetStatus: 'PENDING',
        hasTranscript: true,
      }),
    ).toBe(KnowledgeBoardState.STREAMING);
  });

  it('should derive ready state', () => {
    expect(
      deriveKnowledgeBoardState({
        transcriptStatus: 'COMPLETED',
        keyframeStatus: 'COMPLETED',
        assetStatus: 'COMPLETED',
      }),
    ).toBe(KnowledgeBoardState.READY);
  });

  it('should derive synced state', () => {
    expect(
      deriveKnowledgeBoardState({
        transcriptStatus: 'COMPLETED',
        keyframeStatus: 'COMPLETED',
        assetStatus: 'COMPLETED',
        syncedTo: ['notion'],
      }),
    ).toBe(KnowledgeBoardState.SYNCED);
  });

  it('should derive failed state', () => {
    expect(
      deriveKnowledgeBoardState({
        transcriptStatus: 'FAILED',
      }),
    ).toBe(KnowledgeBoardState.FAILED);
  });

  it('should parse mm:ss and hh:mm:ss and Chinese seconds', () => {
    expect(parseTimestampToSeconds('12:34')).toBe(754);
    expect(parseTimestampToSeconds('01:02:03')).toBe(3723);
    expect(parseTimestampToSeconds('发生在 18 秒')).toBe(18);
  });
});

