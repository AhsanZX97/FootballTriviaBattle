import worldCup from '../../assets/levels/category-world-cup.png'
import europeanCups from '../../assets/levels/category-european-cups.png'
import leagues from '../../assets/levels/category-leagues.png'
import players from '../../assets/levels/category-players.png'
import clubs from '../../assets/levels/category-clubs.png'
import nationalTeams from '../../assets/levels/category-national-teams.png'
import rules from '../../assets/levels/category-rules.png'
import records from '../../assets/levels/category-records.png'
import picturePlayers from '../../assets/levels/category-picture-players.png'
import pictureTeams from '../../assets/levels/category-picture-teams.png'
import type { TopicPrefix } from '../../services/trivia/bank'

const ICONS: Record<TopicPrefix, string> = {
  wc: worldCup,
  ec: europeanCups,
  lg: leagues,
  pl: players,
  cl: clubs,
  nt: nationalTeams,
  ru: rules,
  re: records,
  pp: picturePlayers,
  pt: pictureTeams,
}

/** Card-face icon for a question id. Never the question's own photo or crest:
 * a picture card only reveals its image once opened. */
export function categoryIcon(questionId: string): string {
  const prefix = questionId.split('-')[0] as TopicPrefix
  return ICONS[prefix] ?? records
}
