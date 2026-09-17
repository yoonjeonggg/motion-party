import { useEffect } from 'react';
import './App.css';
import { hasOnboarded, Tutorial } from './components/Tutorial';
import { Calibration } from './components/Calibration';
import { Lobby } from './components/Lobby';
import { MatchResult } from './components/MatchResult';
import { PlayScreen } from './components/PlayScreen';
import { RoundResult } from './components/RoundResult';
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

  return (
    <main className="app-root">
      {screen === 'ONBOARDING' && <Tutorial />}
      {screen === 'LOBBY' && <Lobby />}
      {screen === 'WAITING' && <WaitingRoom />}
      {screen === 'CALIBRATING' && <Calibration />}
      {screen === 'PLAYING' && <PlayScreen />}
      {screen === 'ROUND_RESULT' && <RoundResult />}
      {screen === 'MATCH_RESULT' && <MatchResult />}
    </main>
  );
}

export default App;
