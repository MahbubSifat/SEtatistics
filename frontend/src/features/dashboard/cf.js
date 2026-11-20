const TITLES = {
  newbie: 'Newbie',
  pupil: 'Pupil',
  specialist: 'Specialist',
  expert: 'Expert',
  'candidate master': 'Candidate Master',
  master: 'Master',
  'international master': 'International Master',
  grandmaster: 'Grandmaster',
  'international grandmaster': 'International Grandmaster',
  'legendary grandmaster': 'Legendary Grandmaster',
}

export const cfTitle = (rank) => TITLES[rank] ?? 'Unrated'
export const cfClass = (rank) => `cf--${(rank || 'unrated').replace(/\s+/g, '-')}`