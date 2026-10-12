import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DemoFigure } from '../DemoFigure';
import { Gauge } from './Gauge';
import { RopeTrack } from './RopeTrack';
import { ScoreLine } from './ScoreLine';
import { TeamScore } from './TeamScore';

const fill = (container: HTMLElement) => container.querySelector<HTMLElement>('.gauge-fill')!;
/** The 0..1 fraction of the track the marker sits at (jsdom normalizes the calc() term order). */
const marker = (container: HTMLElement) =>
  Number(/calc\(12px \+ ([\d.]+) \* \(100% - 24px\)\)/.exec(container.querySelector<HTMLElement>('.rope-marker')!.style.left)?.[1]);

describe('Gauge', () => {
  it.each([
    [0.426, '43%'],
    [-1, '0%'],
    [3, '100%'],
  ])('renders %s as %s', (value, width) => {
    const { container } = render(<Gauge value={value} />);
    expect(fill(container).style.width).toBe(width);
  });

  it('uses the opponent color only when alt', () => {
    expect(fill(render(<Gauge value={1} />).container)).not.toHaveClass('opponent');
    expect(fill(render(<Gauge value={1} alt />).container)).toHaveClass('opponent');
  });
});

describe('RopeTrack', () => {
  it('draws from my point of view: my winning end is always on the right', () => {
    const asA = render(<RopeTrack position={1} mySide="A" />).container;
    const asB = render(<RopeTrack position={-1} mySide="B" />).container;
    expect(marker(asA)).toBe(1);
    expect(marker(asB)).toBe(1);
    expect(marker(render(<RopeTrack position={1} mySide="B" />).container)).toBe(0);
  });

  it('centres the marker at 0 and puts my zone first', () => {
    const { container } = render(<RopeTrack position={0} mySide="B" />);
    expect(marker(container)).toBe(0.5);
    const zones = container.querySelectorAll('.rope-zone');
    expect(zones[0]).toHaveClass('zone-B');
    expect(zones[1]).toHaveClass('zone-A');
  });
});

describe('ScoreLine', () => {
  it('always shows my score first', () => {
    const { container } = render(<ScoreLine scores={{ A: 2, B: 1 }} mySide="B" />);
    expect([...container.querySelectorAll('strong')].map((s) => s.textContent)).toEqual(['1', '2']);
  });
});

describe('TeamScore', () => {
  it('shows one decimal and treats a missing value as 0', () => {
    render(
      <>
        <TeamScore value={12.345} />
        <TeamScore value={undefined} />
      </>,
    );
    expect(screen.getByText('누적 점수 12.3')).toBeInTheDocument();
    expect(screen.getByText('누적 점수 0.0')).toBeInTheDocument();
  });
});

describe('DemoFigure', () => {
  it('applies the variant class and only draws the rope for tug-style demos', () => {
    const pull = render(<DemoFigure variant="pull" rope />).container;
    expect(pull.querySelector('.demo-figure')).toHaveClass('pull');
    expect(pull.querySelector('.fig-rope')).not.toBeNull();
    expect(render(<DemoFigure variant="move" />).container.querySelector('.fig-rope')).toBeNull();
  });

  it('shows frost only while frozen', () => {
    expect(render(<DemoFigure variant="freeze" />).container.querySelector('.fig-frost')).not.toBeNull();
    expect(render(<DemoFigure variant="move" />).container.querySelector('.fig-frost')).toBeNull();
  });
});
