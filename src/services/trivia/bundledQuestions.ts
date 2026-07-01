import type { Question } from '../../types/trivia'

/**
 * Offline / rate-limit fallback. Small hand-written sports set so the game never
 * hard-fails. Served through the same questionSource abstraction as OpenTDB.
 */
export const bundledQuestions: Question[] = [
  {
    id: 'b1',
    prompt: 'Which country won the 2018 FIFA World Cup?',
    correctAnswer: 'France',
    answers: ['France', 'Croatia', 'Brazil', 'Germany'],
    difficulty: 'easy',
    category: 'Sports',
  },
  {
    id: 'b2',
    prompt: 'Which club has won the most UEFA Champions League titles?',
    correctAnswer: 'Real Madrid',
    answers: ['Real Madrid', 'AC Milan', 'Barcelona', 'Bayern Munich'],
    difficulty: 'medium',
    category: 'Sports',
  },
  {
    id: 'b3',
    prompt: 'Who is the all-time top scorer of the FIFA World Cup?',
    correctAnswer: 'Miroslav Klose',
    answers: ['Miroslav Klose', 'Ronaldo', 'Pelé', 'Just Fontaine'],
    difficulty: 'hard',
    category: 'Sports',
  },
  {
    id: 'b4',
    prompt: 'How many players are on a football team on the pitch at kickoff?',
    correctAnswer: '11',
    answers: ['11', '10', '12', '9'],
    difficulty: 'easy',
    category: 'Sports',
  },
  {
    id: 'b5',
    prompt: 'Which player has won the most Ballon d’Or awards?',
    correctAnswer: 'Lionel Messi',
    answers: ['Lionel Messi', 'Cristiano Ronaldo', 'Michel Platini', 'Johan Cruyff'],
    difficulty: 'medium',
    category: 'Sports',
  },
  {
    id: 'b6',
    prompt: 'In which year was the first FIFA World Cup held?',
    correctAnswer: '1930',
    answers: ['1930', '1926', '1934', '1928'],
    difficulty: 'medium',
    category: 'Sports',
  },
  {
    id: 'b7',
    prompt: 'What is the maximum duration of a standard penalty shootout per side before sudden death?',
    correctAnswer: '5 kicks',
    answers: ['5 kicks', '3 kicks', '7 kicks', '10 kicks'],
    difficulty: 'easy',
    category: 'Sports',
  },
  {
    id: 'b8',
    prompt: 'Which national team is known as the "Azzurri"?',
    correctAnswer: 'Italy',
    answers: ['Italy', 'Spain', 'Argentina', 'Portugal'],
    difficulty: 'easy',
    category: 'Sports',
  },
]
