import { useEffect } from 'react';
import './App.css';
import { hasOnboarded, Tutorial } from './components/Tutorial';
import { Calibration } from './components/Calibration';
import { FreezeTagPlayScreen } from './components/FreezeTagPlayScreen';
import { GameTutorial, hasSeenGameTutorial } from './components/GameTutorial';
import { Lobby } from './components/Lobby';
import { MatchResult } from './components/MatchResult';
import { PlayScreen } from './components/PlayScreen';
import { RoundResult } from './components/RoundResult';
import { SimonSaysPlayScreen } from './components/SimonSaysPlayScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { useGameSocket } from './hooks/useGameSocket';
import { useGameStore } from './store/gameStore';

function App() {
  useGameSocket();
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);
  const session = useGameStore((s) => s.session);

  useEffect(() => {
    if (screen === 'ONBOARDING' && !session && hasOnboarded()) {
      setScreen('LOBBY');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Right after joining/creating a room, detour into the per-game-mode "how to
  // play" demo the first time that gameType is played, before entering WAITING.
  useEffect(() => {
    if (screen === 'WAITING' && session && !hasSeenGameTutorial(session.gameType)) {
      setScreen('GAME_TUTORIAL');
    }
  }, [screen, session, setScreen]);

  return (
    <main className="app-root">
      {screen === 'ONBOARDING' && <Tutorial />}
      {screen === 'LOBBY' && <Lobby />}
      {screen === 'GAME_TUTORIAL' && <GameTutorial />}
      {screen === 'WAITING' && <WaitingRoom />}
      {screen === 'CALIBRATING' && <Calibration />}
      {screen === 'PLAYING' && session?.gameType === 'freeze_tag' && <FreezeTagPlayScreen />}
      {screen === 'PLAYING' && session?.gameType === 'simon_says' && <SimonSaysPlayScreen />}
      {screen === 'PLAYING' &&
        session?.gameType !== 'freeze_tag' &&
        session?.gameType !== 'simon_says' && <PlayScreen />}
      {screen === 'ROUND_RESULT' && <RoundResult />}
      {screen === 'MATCH_RESULT' && <MatchResult />}
    </main>
  );
}

export default App;
