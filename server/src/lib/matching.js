// Matching engine: rank agents for a language + coverage window, then build the
// cheapest-in-hours team that covers the window (greedy set cover).
const { levelRank, levelWeight } = require('./meta');
const { intersect, subtract, hoursOf, tzOffsetMinutes } = require('./slots');

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * agents: [{ id, name, languages:[{code,level}], freeSlots:[], hourlyRate, rating|null, ratingCount }]
 * need:   { language, minLevel, slots:[], maxRate|null }
 */
function rankAgents(agents, need) {
  const required = need.slots;
  const minRank = levelRank(need.minLevel || 'B2');
  const preferredSkills = need.skills || [];
  const requiredSkills = need.requiredSkills || [];
  const now = need.referenceDate || new Date();
  const out = [];
  for (const a of agents) {
    const lang = a.languages.find((l) => l.code === need.language);
    if (!lang || levelRank(lang.level) < minRank) continue;
    if (need.maxRate != null && a.hourlyRate > need.maxRate) continue;
    if (requiredSkills.some((skill) => !(a.skills || []).includes(skill))) continue;
    if ((need.channels || []).some((channel) => !(a.channels || ['email', 'chat']).includes(channel))) continue;
    if (need.tier && !(a.tiers || ['tier1']).includes(need.tier)) continue;
    const overlap = intersect(a.freeSlots, required);
    if (overlap.length === 0) continue;
    const overlapRatio = required.length ? overlap.length / required.length : 0;
    const languageScore = levelWeight(lang.level);
    const skillScore = preferredSkills.length
      ? preferredSkills.filter((skill) => (a.skills || []).includes(skill)).length / preferredSkills.length
      : 1;
    const experienceScore = Math.min((a.experienceYears || 0) / 5, 1);
    let timezoneScore = 0.5;
    if (need.timezone && a.timezone) {
      const offsetDistance = Math.abs(tzOffsetMinutes(need.timezone, now) - tzOffsetMinutes(a.timezone, now));
      timezoneScore = Math.max(0, 1 - offsetDistance / 720);
    }
    const scoreBreakdown = {
      language: round2(languageScore * 100),
      availability: round2(overlapRatio * 100),
      skills: round2(skillScore * 100),
      experience: round2(experienceScore * 100),
      timezone: round2(timezoneScore * 100),
    };
    const score =
      0.35 * languageScore +
      0.25 * overlapRatio +
      0.2 * skillScore +
      0.1 * experienceScore +
      0.1 * timezoneScore;
    out.push({
      agentId: a.id,
      name: a.name,
      headline: a.headline,
      level: lang.level,
      languages: a.languages,
      skills: a.skills || [],
      experienceYears: a.experienceYears || 0,
      channels: a.channels || ['email', 'chat'],
      tiers: a.tiers || ['tier1'],
      timezone: a.timezone || null,
      verified: true,
      hourlyRate: a.hourlyRate,
      rating: a.rating,
      ratingCount: a.ratingCount || 0,
      overlapSlots: overlap,
      overlapHours: hoursOf(overlap),
      overlapPct: Math.round(overlapRatio * 100),
      scoreBreakdown,
      score: round2(score),
    });
  }
  return out.sort((x, y) => y.score - x.score || x.hourlyRate - y.hourlyRate);
}

/**
 * Greedy cover: repeatedly take the candidate that adds the most uncovered required slots
 * (ties -> higher score, then cheaper). Each pick is assigned ONLY the newly covered slots,
 * so the client never pays for overlapping hours.
 */
function recommendTeam(ranked, requiredSlots) {
  let uncovered = [...requiredSlots];
  const pool = [...ranked];
  const team = [];
  while (uncovered.length && pool.length) {
    let best = null;
    let bestGain = 0;
    for (const c of pool) {
      const gain = intersect(c.overlapSlots, uncovered).length;
      if (
        gain > bestGain ||
        (gain === bestGain && best && gain > 0 && (c.score > best.score || (c.score === best.score && c.hourlyRate < best.hourlyRate)))
      ) {
        best = c;
        bestGain = gain;
      }
    }
    if (!best || bestGain === 0) break;
    const assigned = intersect(best.overlapSlots, uncovered);
    team.push({ ...best, assignedSlots: assigned, assignedHours: hoursOf(assigned), weeklyCost: round2(hoursOf(assigned) * best.hourlyRate) });
    uncovered = subtract(uncovered, assigned);
    pool.splice(pool.indexOf(best), 1);
  }
  const total = requiredSlots.length;
  return {
    team,
    gapSlots: uncovered,
    coveragePct: total ? Math.round(((total - uncovered.length) / total) * 100) : 0,
    weeklyHours: hoursOf(team.flatMap((t) => t.assignedSlots)),
    weeklyCost: round2(team.reduce((s, t) => s + t.weeklyCost, 0)),
  };
}

module.exports = { rankAgents, recommendTeam };
