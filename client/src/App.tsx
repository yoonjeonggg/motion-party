import { useEffect, type ComponentType } from 'react';
import './App.css';
import { Calibration } from './components/Calibration';
import { FreezeTagPlayScreen } from './components/FreezeTagPlayScreen';
import { GameTutorial } from './components/GameTutorial';
import { Lobby } from './components/Lobby';
import { MatchResult } from './components/MatchResult';
import { PlayScreen } from './components/PlayScreen';
import { RoundResult } from './components/RoundResult';
import { SimonSaysPlayScreen } from './components/SimonSaysPlayScreen';
import { Tutorial } from './components/Tutorial';
import { WaitingRoom } from './components/WaitingRoom';
import { useGameSocket } from './hooks/useGameSocket';
import { hasSeenGameTutorial } from './lib/preferences';
import { useGameStore, type Screen } from './store/gameStore';
import type { GameType } from './types';

/** Tug-style games (tug_of_war, arm_wrestle) share the default PlayScreen. */
const PLAY_SCREENS: Record<GameType, ComponentType> = {
  tug_of_war: PlayScreen,
  arm_wrestle: PlayScreen,
  freeze_tag: FreezeTagPlayScreen,
  simon_says: SimonSaysPlayScreen,
};

const SCREENS: Record<Exclude<Screen, 'PLAYING'>, ComponentType> = {
  ONBOARDING: Tutorial,
  LOBBY: Lobby,
  GAME_TUTORIAL: GameTutorial,
  WAITING: WaitingRoom,
  CALIBRATING: Calibration,
  ROUND_RESULT: RoundResult,
  MATCH_RESULT: MatchResult,
};

function App() {
  useGameSocket();
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);
  const session = useGameStore((s) => s.session);

  // Right after joining/creating a room, detour into the per-game-mode "how to
  // play" demo the first time that gameType is played, before entering WAITING.
  useEffect(() => {
    if (screen === 'WAITING' && session && !hasSeenGameTutorial(session.gameType)) {
      setScreen('GAME_TUTORIAL');
    }
  }, [screen, session, setScreen]);

  const Current = screen === 'PLAYING' ? PLAY_SCREENS[session?.gameType ?? 'tug_of_war'] : SCREENS[screen];

  return (
    <main className="app-root">
      <Current />
    </main>
  );
}

export default App;
