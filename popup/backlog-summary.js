import { isFiniteNumber } from '../shared/guards.js';

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatBacklogDuration(totalSeconds) {
  if (!isFiniteNumber(totalSeconds) || totalSeconds < 0) return '';
  if (totalSeconds === 0) return '0m';

  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function createBacklogSummary(records = []) {
  const videoCount = records.length;
  let knownCount = 0;
  let unknownCount = 0;
  let liveCount = 0;
  let totalRemainingSeconds = 0;

  for (const record of records) {
    if (record?.isLive) {
      liveCount += 1;
      continue;
    }

    const remainingSeconds = record?.videoDetails?.remainingSeconds;
    if (!record?.remainingSecondsStale && isFiniteNumber(remainingSeconds) && remainingSeconds >= 0) {
      knownCount += 1;
      totalRemainingSeconds += remainingSeconds;
    } else {
      unknownCount += 1;
    }
  }

  return { videoCount, knownCount, unknownCount, liveCount, totalRemainingSeconds };
}

export function formatBacklogSummary(summary) {
  if (!summary?.videoCount) return '';

  const parts = [pluralize(summary.videoCount, 'video')];
  parts.push(
    summary.knownCount > 0
      ? `${formatBacklogDuration(summary.totalRemainingSeconds)} remaining`
      : 'remaining time unavailable',
  );
  if (summary.unknownCount > 0) parts.push(`${summary.unknownCount} unknown`);
  if (summary.liveCount > 0) parts.push(pluralize(summary.liveCount, 'live stream'));
  return parts.join(' · ');
}
