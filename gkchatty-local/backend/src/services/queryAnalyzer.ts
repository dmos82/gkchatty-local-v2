/**
 * Query Complexity Analyzer for GKChatty
 *
 * Analyzes user queries to determine their complexity level and automatically
 * route them to the most appropriate model (small/fast for simple queries,
 * large/powerful for complex queries).
 *
 * Phase 4: Smart Model Routing
 * Status: PROTOTYPE - Ready for testing
 */

export interface QueryComplexity {
  /**
   * Complexity level of the query
   */
  level: 'simple' | 'medium' | 'complex';

  /**
   * Confidence score (0-1) in the complexity assessment
   */
  confidence: number;

  /**
   * Reasons why this complexity level was assigned
   */
  indicators: string[];

  /**
   * Raw score used for calculation (for debugging)
   */
  score: number;
}

export class QueryAnalyzer {
  /**
   * Analyze a user query and determine its complexity
   *
   * @param query - The user's question or prompt
   * @returns QueryComplexity object with level, confidence, and indicators
   *
   * @example
   * ```typescript
   * const analyzer = new QueryAnalyzer();
   * const result = analyzer.analyze('What is React?');
   * // Returns: { level: 'simple', confidence: 0.3, indicators: [...] }
   * ```
   */
  analyze(query: string): QueryComplexity {
    const indicators: string[] = [];
    let score = 0;

    // Normalize query for analysis
    const normalized = query.toLowerCase().trim();

    // 1. LENGTH ANALYSIS (0-6 points)
    if (normalized.length < 50) {
      score += 0;
      indicators.push('Short query (<50 chars)');
    } else if (normalized.length < 150) {
      score += 2;
      indicators.push('Medium length (50-150 chars)');
    } else if (normalized.length < 300) {
      score += 4;
      indicators.push('Long query (150-300 chars)');
    } else if (normalized.length < 500) {
      score += 5;
      indicators.push('Very long query (300-500 chars)');
    } else {
      score += 6;
      indicators.push('Extremely long query (>500 chars)');
    }

    // 2. KEYWORD ANALYSIS - Simple indicators (0 points)
    const simpleKeywords = [
      'what is',
      'define',
      'list',
      'show me',
      'how do i',
      'can you',
      'tell me about',
      'explain',
    ];

    const hasSimple = simpleKeywords.some((kw) => normalized.includes(kw));
    if (hasSimple) {
      score += 0;
      indicators.push('Simple keywords detected');
    }

    // 3. KEYWORD ANALYSIS - Complex indicators (+6 points)
    const complexKeywords = [
      'analyze',
      'compare',
      'contrast',
      'design',
      'evaluate',
      'critique',
      'justify',
      'synthesize',
      'optimize',
      'architecture',
      'strategy',
      'explain why',
      'explain how',
      'explain the difference',
      'trade-off',
      'trade-offs',
      'best practices',
      'considerations',
      'implications',
      'suggest',
      'improve',
      'rewrite',
      'refactor',
      'migration',
      'scalable',
      'scalability',
    ];

    const complexFound = complexKeywords.filter((kw) =>
      normalized.includes(kw)
    );
    if (complexFound.length > 0) {
      score += 6;
      indicators.push(`Complex keywords: ${complexFound.join(', ')}`);

      // Bonus for multiple complex keywords (+3 points)
      if (complexFound.length >= 2) {
        score += 3;
        indicators.push(`Multiple complex indicators (${complexFound.length})`);
      }
    }

    // 4. QUESTION DEPTH - Multiple questions (+2 points)
    const questionCount = (normalized.match(/\?/g) || []).length;
    if (questionCount > 1) {
      score += 2;
      indicators.push(`Multiple questions (${questionCount})`);
    } else if (questionCount === 1) {
      indicators.push('Single question');
    }

    // 4b. COMPOUND QUESTIONS - Questions with multiple parts (+3 points)
    const compoundPatterns = [
      /\band when\b/i,
      /\band how\b/i,
      /\band why\b/i,
      /\band what\b/i,
      /\band which\b/i,
      /\bor when\b/i,
      /\bor how\b/i,
      /\bor why\b/i,
    ];
    const hasCompound = compoundPatterns.some((pattern) => pattern.test(query));
    if (hasCompound && questionCount >= 1) {
      score += 3;
      indicators.push('Compound question (multiple parts)');
    }

    // 5. TECHNICAL TERMS (+2 points)
    const technicalTerms = /\b(function|class|API|database|algorithm|interface|component|service|endpoint|schema|model|controller|middleware|authentication|authorization|deployment|infrastructure|scalability|performance|optimization|refactor|async|await|promise|callback|Redux|Context|hooks|state|props|routing|webpack|babel|typescript|REST|GraphQL|WebSocket|microservice|monolith|Docker|Kubernetes|CI\/CD)\b/i;
    if (technicalTerms.test(query)) {
      score += 2;
      indicators.push('Technical terms detected');
    }

    // 6. CODE BLOCKS (+3 points)
    const hasCodeBlock = /```|`[^`]+`/.test(query);
    if (hasCodeBlock) {
      score += 3;
      indicators.push('Code blocks or inline code detected');
    }

    // 7. CONTEXT REQUIREMENTS (+3 points)
    const contextWords = /\b(above|previous|earlier|context|mentioned|before|last|prior)\b/i;
    if (contextWords.test(query)) {
      score += 3;
      indicators.push('Requires context from conversation history');
    }

    // 8. MULTI-STEP TASKS (+4 points)
    const multiStepWords = /\b(first|second|third|then|after|next|finally|step|steps|process|procedure)\b/i;
    const multiStepCount = (query.match(multiStepWords) || []).length;
    if (multiStepCount >= 2) {
      score += 4;
      indicators.push(`Multi-step task (${multiStepCount} step indicators)`);
    }

    // 9. LIST REQUESTS - Usually simpler (-2 points for simple lists)
    const listRequest = /\b(list|show me all|give me|what are)\b/i;
    if (listRequest.test(normalized) && !complexFound.length) {
      score = Math.max(0, score - 2);
      indicators.push('Simple list request');
    }

    // 10. YES/NO QUESTIONS - Usually simpler (-1 point)
    const yesNoQuestion = /\b(is|are|can|will|should|does|do|am|have|has)\b.*\?$/i;
    if (yesNoQuestion.test(normalized) && normalized.length < 100) {
      score = Math.max(0, score - 1);
      indicators.push('Yes/no question');
    }

    // DETERMINE COMPLEXITY LEVEL based on score
    let level: 'simple' | 'medium' | 'complex';
    if (score <= 5) {
      level = 'simple';
    } else if (score <= 10) {
      level = 'medium';
    } else {
      level = 'complex';
    }

    // CALCULATE CONFIDENCE (normalized score / max possible score)
    const maxScore = 38; // Sum of all possible points (updated with new factors + bonuses)
    const confidence = Math.min(score / maxScore, 1);

    return {
      level,
      confidence,
      indicators,
      score,
    };
  }

  /**
   * Batch analyze multiple queries
   *
   * @param queries - Array of user queries
   * @returns Array of QueryComplexity results
   */
  analyzeBatch(queries: string[]): QueryComplexity[] {
    return queries.map((query) => this.analyze(query));
  }

  /**
   * Get complexity statistics for a set of queries
   *
   * @param queries - Array of user queries
   * @returns Statistics about complexity distribution
   */
  getStatistics(queries: string[]): {
    total: number;
    simple: number;
    medium: number;
    complex: number;
    averageScore: number;
  } {
    const results = this.analyzeBatch(queries);

    return {
      total: results.length,
      simple: results.filter((r) => r.level === 'simple').length,
      medium: results.filter((r) => r.level === 'medium').length,
      complex: results.filter((r) => r.level === 'complex').length,
      averageScore:
        results.reduce((sum, r) => sum + r.score, 0) / results.length,
    };
  }
}

// Export singleton instance
export const queryAnalyzer = new QueryAnalyzer();
