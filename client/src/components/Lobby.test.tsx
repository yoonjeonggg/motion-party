import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isExpressionEnabled } from '../lib/preferences';
import { useGameStore } from '../store/gameStore';
import { socket } from '../test/fakeSocket';
import { Lobby } from './Lobby';

vi.mock('../lib/socket', () => import('../test/fakeSocket'));

const createButton = () => screen.getByRole('button', { name: '방 만들기' });
const joinButton = () => screen.getByRole('button', { name: '참가하기' });
const codeInput = () => screen.getByPlaceholderText('친구에게 받은 6자리 코드');
const nicknameInput = () => screen.getByPlaceholderText('닉네임을 입력하세요');

beforeEach(() => {
  socket.reset();
});

describe('Lobby: creating a room', () => {
  it('creates a 1v1 tug-of-war room with the default nickname', () => {
    render(<Lobby />);
    fireEvent.click(createButton());
    expect(socket.sent('room:create')).toEqual([{ nickname: '방장', mode: '1v1', gameType: 'tug_of_war' }]);
  });

  it('uses the chosen game, mode and trimmed nickname', () => {
    render(<Lobby />);
    fireEvent.change(nicknameInput(), { target: { value: '  철수  ' } });
    fireEvent.click(screen.getByRole('radio', { name: '얼음땡' }));
    fireEvent.click(screen.getByRole('radio', { name: '4:4 팀전' }));
    expect(screen.getByRole('radio', { name: '얼음땡' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(createButton());
    expect(socket.sent('room:create')).toEqual([{ nickname: '철수', mode: '4v4', gameType: 'freeze_tag' }]);
  });

  it('blocks a double tap until the server answers or 3s pass', () => {
    vi.useFakeTimers();
    render(<Lobby />);
    fireEvent.click(createButton());
    expect(createButton()).toBeDisabled();
    act(() => vi.advanceTimersByTime(3_000));
    expect(createButton()).toBeEnabled();
  });

  it('re-enables right away when the server reports an error', () => {
    render(<Lobby />);
    fireEvent.click(createButton());
    act(() => useGameStore.getState().setError('방에 참가할 수 없어요.'));
    expect(createButton()).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('방에 참가할 수 없어요.');
  });
});

describe('Lobby: joining a room', () => {
  it('keeps join disabled until 6 characters are entered', () => {
    render(<Lobby />);
    expect(joinButton()).toBeDisabled();
    fireEvent.change(codeInput(), { target: { value: 'abc23' } });
    expect(joinButton()).toBeDisabled();
    fireEvent.change(codeInput(), { target: { value: 'abc234' } });
    expect(joinButton()).toBeEnabled();
  });

  it('uppercases and strips anything that is not a letter or digit', () => {
    render(<Lobby />);
    fireEvent.change(codeInput(), { target: { value: 'a-b c2!34' } });
    expect(codeInput()).toHaveValue('ABC234');
  });

  it('joins with the code and the default guest nickname', () => {
    render(<Lobby />);
    fireEvent.change(codeInput(), { target: { value: 'abc234' } });
    fireEvent.click(joinButton());
    expect(socket.sent('room:join')).toEqual([{ code: 'ABC234', nickname: '참가자' }]);
  });

  it('rejects a short code submitted with Enter', () => {
    render(<Lobby />);
    fireEvent.change(codeInput(), { target: { value: 'abc' } });
    fireEvent.submit(codeInput().closest('form')!);
    expect(socket.sent('room:join')).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('방 코드 6자리를 입력해 주세요.');
  });

  it('clears the error as soon as the code is edited', () => {
    useGameStore.setState({ error: '존재하지 않는 방 코드예요.' });
    render(<Lobby />);
    fireEvent.change(codeInput(), { target: { value: 'X' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Lobby: misc', () => {
  it('only offers the motion-only toggle for tug-style games, and persists it', () => {
    render(<Lobby />);
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);
    expect(isExpressionEnabled()).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: '동작 따라하기' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('warns when the server is unreachable', () => {
    useGameStore.setState({ connectionError: true });
    render(<Lobby />);
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없어요');
  });

  it('can replay the onboarding', () => {
    render(<Lobby />);
    fireEvent.click(screen.getByText('튜토리얼 다시보기'));
    expect(useGameStore.getState().screen).toBe('ONBOARDING');
  });
});
