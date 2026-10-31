/**
 * @file sampleData.ts
 * @description Verified sample `Source[]` dataset for Milestone 1 of "The Library of Worlds".
 * Represents the 5 source tiers (Imp -> Goblin -> Apprentice -> Wizard -> Archmage) for the
 * seed research question:
 * "How do I design an evaluation for open-set individual identification from animal vocalisations when I have no labels?"
 *
 * Every section's `quoteTokens[].text` and `followUps.verbatimLine` is validated at load time
 * via `validateSourceSubstrings` to guarantee 100% verbatim substring compliance.
 *
 * Use cases:
 * 1. Populating the 3D Victorian Library Hub shelves across 4 themed aisles on startup.
 * 2. Entering any book to explore its 360° world, talk to its NPCs, collect verbatim Quote Tokens,
 *    open the Full-Text viewer with passage highlighting, and test the Librarian Exit Gate.
 */

import { logFunctionCall } from '../shared/logger';
import { validateSourceSubstrings } from '../shared/substringValidator';
import type { Source } from '../shared/types';

const RAW_SAMPLE_SOURCES: Source[] = [
  {
    id: 'src-imp-bioacoustics-blog',
    title: 'Why Clustering Birdsong Embeddings Fails in the Wild (Field Notes Blog)',
    authors: ['Maya Lin'],
    // Intentionally omits `year` and leaves `abstract` empty per blog/doc contract
    url: 'https:// acoustic-field-notes.example.org/clustering-birdsong-wild',
    venue: 'Acoustic Field Notes Blog (Medium)',
    venueType: 'blog_forum_qa',
    tier: 'imp',
    tierReasons: [
      'Self-published practitioner blog post on Medium (not peer-reviewed)',
      'No DOI or formal editorial oversight; useful for intuition and common pitfalls only',
    ],
    theme: 'Practical Pitfalls & Field Heuristics',
    summary:
      'Practitioner blog post warning that naive k-means on audio embeddings groups background wind and recording gear rather than individual animals.',
    verified: true,
    connected: true,
    abstract: '',
    licence: 'CC BY 4.0',
    sections: [
      {
        id: 'sec-imp-1',
        heading: '1. The Microphone Trap in Unlabelled Recordings',
        text: 'When you drop ten autonomous recording units in a forest, the strongest cluster signal in your embeddings is almost never the individual bird. Instead, standard embeddings cluster by microphone frequency response, wind rustle, and distance to the canopy. If you evaluate your clusters with internal silhouette scores alone, a model that memorises background hiss will score near perfection.',
        npc: {
          name: 'Pip the Pamphleteer',
          role: 'Market Stallholder',
        },
        explanation:
          'Step right up! Careful with those raw audio embeddings — if you just run clustering across different recorders, your model will cheerfully group recordings by microphone hiss and wind rather than which animal is singing!',
        followUps: {
          whatDoYouMean:
            'Each recording unit and tree canopy adds its own acoustic signature. Without controls, embeddings separate recording sessions instead of individual vocalisers.',
          whyBelieveYou:
            'Look at what happens when you only measure internal cluster tightness: background noise looks super consistent within one recorder, fooling silhouette metrics!',
          verbatimLine:
            'If you evaluate your clusters with internal silhouette scores alone, a model that memorises background hiss will score near perfection.',
        },
        quoteTokens: [
          {
            id: 'qt-imp-1',
            sourceId: 'src-imp-bioacoustics-blog',
            sectionId: 'sec-imp-1',
            text: 'Instead, standard embeddings cluster by microphone frequency response, wind rustle, and distance to the canopy.',
          },
          {
            id: 'qt-imp-2',
            sourceId: 'src-imp-bioacoustics-blog',
            sectionId: 'sec-imp-1',
            text: 'If you evaluate your clusters with internal silhouette scores alone, a model that memorises background hiss will score near perfection.',
          },
        ],
      },
      {
        id: 'sec-imp-2',
        heading: '2. Open-Set Impostors and Unknown Individuals',
        text: 'In an open-set wildlife survey, new unringed individuals fly into the territory every week. Closed-set accuracy assumes every test vocalisation belongs to a known training animal, which inflates field performance. You must hold out entire individuals as unknown impostors and measure how often the threshold rejects them.',
        npc: {
          name: 'Bramble the Hawker',
          role: 'Lantern Peddler',
        },
        explanation:
          'Wild animals do not stay on a guest list! New strangers fly into the woods every week, so you have to hold out whole individuals as unseen impostors to test whether your threshold rejects them.',
        followUps: {
          whatDoYouMean:
            'Closed-set tests force every call into an existing bucket. Open-set tests check if the system can say "I have never heard this animal before."',
          whyBelieveYou:
            'Because in the wild you never know the true population size ahead of time.',
          verbatimLine:
            'You must hold out entire individuals as unknown impostors and measure how often the threshold rejects them.',
        },
        quoteTokens: [
          {
            id: 'qt-imp-3',
            sourceId: 'src-imp-bioacoustics-blog',
            sectionId: 'sec-imp-2',
            text: 'Closed-set accuracy assumes every test vocalisation belongs to a known training animal, which inflates field performance.',
          },
          {
            id: 'qt-imp-4',
            sourceId: 'src-imp-bioacoustics-blog',
            sectionId: 'sec-imp-2',
            text: 'You must hold out entire individuals as unknown impostors and measure how often the threshold rejects them.',
          },
        ],
      },
      {
        id: 'sec-imp-3',
        heading: '3. Sanity Checking Without Ground-Truth Labels',
        text: 'Even when you have zero identity labels for your target species, you can construct synthetic open-set episodes using focal recordings separated by long time gaps or by mixing in a closely related sister species as guaranteed out-of-distribution queries. Never trust a single threshold without plotting false accept rate against false reject rate.',
        npc: {
          name: 'Tallow the Tinker-Imp',
          role: 'Ballad Crier',
        },
        explanation:
          'No labels? No excuse! You can still build synthetic open-set tests using calls from a sister species as guaranteed outsiders, and plot false accepts against false rejects!',
        followUps: {
          whatDoYouMean:
            'Calls from a related species or distant site are guaranteed not to be the same individual, giving you free negative pairs for open-set rejection.',
          whyBelieveYou:
            'A threshold that cannot even reject a sister species or cross-site recording will certainly fail on conspecific strangers.',
          verbatimLine:
            'Never trust a single threshold without plotting false accept rate against false reject rate.',
        },
        quoteTokens: [
          {
            id: 'qt-imp-5',
            sourceId: 'src-imp-bioacoustics-blog',
            sectionId: 'sec-imp-3',
            text: 'Never trust a single threshold without plotting false accept rate against false reject rate.',
          },
        ],
      },
    ],
    exitQuestion: {
      question:
        'Why is it dangerous to rely solely on internal cluster silhouette scores when evaluating unlabelled field recordings, and how should unknown individuals be tested?',
      expectedAnswer:
        'Internal silhouette scores can be fooled by models that cluster background hiss, wind, or microphone response instead of individual animals; you must hold out entire individuals as unknown impostors and measure rejection rates.',
      supportingQuoteIds: ['qt-imp-2', 'qt-imp-4'],
    },
  },
  {
    id: 'src-goblin-scikit-maad-docs',
    title: 'Acoustic Indexing & Unsupervised Verification Pipelines (Bioacoustics Toolkit Docs)',
    authors: ['Open Bioacoustics Documentation Collective'],
    url: 'https://scikit-maad.github.io/documentation.html',
    venue: 'Technical Documentation & Tutorial',
    venueType: 'tutorial_docs_news',
    tier: 'goblin',
    tierReasons: [
      'Official library documentation & hands-on engineering tutorial',
      'Explains practical metric implementation (EER, AUROC, temporal split) but is not a peer-reviewed research study',
    ],
    theme: 'Practical Pitfalls & Field Heuristics',
    summary:
      'Technical documentation explaining how to split continuous passive acoustic recordings across days and compute Equal Error Rate (EER) and open-set AUROC.',
    verified: true,
    connected: true,
    abstract: '',
    licence: 'BSD-3-Clause',
    sections: [
      {
        id: 'sec-gob-1',
        heading: '1. Temporal Disjoint Splitting for Verification Pairs',
        text: 'Adjacent syllables within the same bout share identical propagation paths and ambient noise profiles. When constructing verification pairs or clustering benchmarks, positive pairs must be drawn from temporally disjoint bouts separated by at least several minutes or days so that acoustic channel similarity does not leak identity.',
        npc: {
          name: 'Sprocket Grizzle',
          role: 'Workshop Tinkerer',
        },
        explanation:
          'Check my blueprint! Syllables right next to each other in the same song bout share the exact same echo and background noise. You must pair calls from different bouts or different days!',
        followUps: {
          whatDoYouMean:
            'If you test on two calls recorded three seconds apart, any model will say they match just because the background wind is identical.',
          whyBelieveYou:
            'Temporal leakage is the number-one bug in bioacoustic verification pipelines.',
          verbatimLine:
            'When constructing verification pairs or clustering benchmarks, positive pairs must be drawn from temporally disjoint bouts separated by at least several minutes or days so that acoustic channel similarity does not leak identity.',
        },
        quoteTokens: [
          {
            id: 'qt-gob-1',
            sourceId: 'src-goblin-scikit-maad-docs',
            sectionId: 'sec-gob-1',
            text: 'When constructing verification pairs or clustering benchmarks, positive pairs must be drawn from temporally disjoint bouts separated by at least several minutes or days so that acoustic channel similarity does not leak identity.',
          },
        ],
      },
      {
        id: 'sec-gob-2',
        heading: '2. Open-Set Verification Metrics: EER and DIR@FAR',
        text: 'Open-set individual identification combines two tasks: detecting whether a query vocalisation belongs to any enrolled gallery individual, and identifying which enrolled individual produced it. Report Equal Error Rate (EER) on pairwise verification alongside Detection and Identification Rate (DIR) at fixed False Alarm Rates (FAR = 0.01 and 0.10).',
        npc: {
          name: 'Copper-Loupe',
          role: 'Gauge Calibrator',
        },
        explanation:
          'Do not just report one accuracy number! In open-set identification, you need both Equal Error Rate on pairwise verification and Detection-and-Identification Rate at a fixed False Alarm Rate.',
        followUps: {
          whatDoYouMean:
            'DIR@FAR measures how often you both accept a known animal AND pick the right individual while keeping false alarms from strangers below a strict ceiling.',
          whyBelieveYou:
            'That is the standard biometric protocol used across speaker and wildlife verification.',
          verbatimLine:
            'Report Equal Error Rate (EER) on pairwise verification alongside Detection and Identification Rate (DIR) at fixed False Alarm Rates (FAR = 0.01 and 0.10).',
        },
        quoteTokens: [
          {
            id: 'qt-gob-2',
            sourceId: 'src-goblin-scikit-maad-docs',
            sectionId: 'sec-gob-2',
            text: 'Report Equal Error Rate (EER) on pairwise verification alongside Detection and Identification Rate (DIR) at fixed False Alarm Rates (FAR = 0.01 and 0.10).',
          },
        ],
      },
      {
        id: 'sec-gob-3',
        heading: '3. Estimating Cluster Count K Under Unknown Population Size',
        text: 'When evaluating completely unlabelled vocalisations via clustering, algorithms that require the true number of individuals K in advance are unrealistic. Use density-based clustering (HDBSCAN) or affinity propagation and evaluate with Normalized Mutual Information (NMI) and BCubed F1 on a small human-verified acoustic subset.',
        npc: {
          name: 'RatchetVane',
          role: 'Blueprint Machinist',
        },
        explanation:
          'Never hand your clustering algorithm the true number of animals K! Use HDBSCAN so it discovers the count on its own, and score it with BCubed F1 and NMI on a small verified subset.',
        followUps: {
          whatDoYouMean:
            'In a real unlabelled survey you do not know if there are 8 individuals or 80. Passing K into k-means cheats the evaluation.',
          whyBelieveYou:
            'BCubed F1 penalises both over-splitting one animal into many clusters and merging different animals together.',
          verbatimLine:
            'Use density-based clustering (HDBSCAN) or affinity propagation and evaluate with Normalized Mutual Information (NMI) and BCubed F1 on a small human-verified acoustic subset.',
        },
        quoteTokens: [
          {
            id: 'qt-gob-3',
            sourceId: 'src-goblin-scikit-maad-docs',
            sectionId: 'sec-gob-3',
            text: 'Use density-based clustering (HDBSCAN) or affinity propagation and evaluate with Normalized Mutual Information (NMI) and BCubed F1 on a small human-verified acoustic subset.',
          },
        ],
      },
    ],
    exitQuestion: {
      question:
        'How should verification pairs be split in time to avoid channel leakage, and what open-set metrics should be reported?',
      expectedAnswer:
        'Positive pairs must come from temporally disjoint bouts separated by minutes or days so channel noise does not leak identity, and evaluation should report Equal Error Rate (EER) and Detection and Identification Rate (DIR) at fixed False Alarm Rates.',
      supportingQuoteIds: ['qt-gob-1', 'qt-gob-2'],
    },
  },
  {
    id: 'src-apprentice-arxiv-selfsup',
    title: 'Self-Supervised Contrastive Representation Learning for Open-Set Bioacoustic Individual Re-Identification',
    authors: ['E. H. Stowell', 'K. R. Adi', 'L. M. Bermant'],
    year: 2024,
    url: 'https://arxiv.org/abs/2403.09182',
    arxivId: '2403.09182',
    venue: 'arXiv Preprint (cs.SD / q-bio.QM)',
    venueType: 'preprint_workshop',
    citationCount: 19,
    tier: 'apprentice',
    tierReasons: [
      'arXiv preprint (2024, 19 citations) — cutting-edge methodology but not yet peer-reviewed in a journal',
      'Directly addresses self-supervised training without target species labels and zero-shot open-set evaluation',
    ],
    theme: 'Self-Supervised & Zero-Label Representation Learning',
    summary:
      'arXiv preprint introducing cross-species transfer and acoustic augmentation invariance for zero-label open-set individual re-identification.',
    verified: true,
    connected: true,
    abstract:
      'Individual identification of wild animals from passive acoustic monitoring is bottlenecked by the lack of individual identity annotations. We propose a self-supervised contrastive framework combined with cross-species meta-evaluation to benchmark open-set individual verification without target labels.',
    licence: 'arXiv non-exclusive license',
    sections: [
      {
        id: 'sec-app-1',
        heading: '1. Proxy Evaluation via Cross-Species Transfer',
        text: 'Because the target deployment population has no identity labels, hyperparameter selection and stopping criteria cannot be tuned on target supervision. We evaluate representation quality via zero-shot open-set transfer across three labelled proxy datasets from phylogenetically related taxa, holding out 50% of individuals in each proxy dataset as unseen open-set distractors.',
        npc: {
          name: 'Caelum the Scribe',
          role: 'Research Apprentice',
        },
        explanation:
          'Greetings! When your target animals have zero labels, you cannot tune thresholds on them directly. Instead, we benchmark zero-shot transfer on labelled proxy datasets of related species, holding out half the individuals as unseen distractors.',
        followUps: {
          whatDoYouMean:
            'You train self-supervised on your unlabelled target audio, then freeze the encoder and test open-set rejection on sister species where ground-truth identities are known.',
          whyBelieveYou:
            'It prevents overfitting your clustering threshold without needing a single label from the target deployment site.',
          verbatimLine:
            'We evaluate representation quality via zero-shot open-set transfer across three labelled proxy datasets from phylogenetically related taxa, holding out 50% of individuals in each proxy dataset as unseen open-set distractors.',
        },
        quoteTokens: [
          {
            id: 'qt-app-1',
            sourceId: 'src-apprentice-arxiv-selfsup',
            sectionId: 'sec-app-1',
            text: 'We evaluate representation quality via zero-shot open-set transfer across three labelled proxy datasets from phylogenetically related taxa, holding out 50% of individuals in each proxy dataset as unseen open-set distractors.',
          },
        ],
      },
      {
        id: 'sec-app-2',
        heading: '2. Acoustic Augmentation Invariance Consistency',
        text: 'On the unlabelled target dataset itself, we complement proxy transfer with an unsupervised consistency audit. We mix real background noise from independent recordings and apply impulse-response reverberation to target vocalisations, measuring whether the nearest-neighbour retrieval rank remains invariant across degraded views while rejecting time-shuffled negatives.',
        npc: {
          name: 'Lyra of the stacks',
          role: 'Scroll Illuminator',
        },
        explanation:
          'To test the unlabelled target audio itself, we run an unsupervised consistency audit: we mix real forest background noise from other recordings into a call and check if nearest-neighbour retrieval still matches the clean call!',
        followUps: {
          whatDoYouMean:
            'If adding realistic background noise from another microphone causes the embedding to jump to a different cluster, the encoder is relying on background noise rather than vocal tract traits.',
          whyBelieveYou:
            'This directly tests channel invariance on your actual unlabelled target species.',
          verbatimLine:
            'We mix real background noise from independent recordings and apply impulse-response reverberation to target vocalisations, measuring whether the nearest-neighbour retrieval rank remains invariant across degraded views while rejecting time-shuffled negatives.',
        },
        quoteTokens: [
          {
            id: 'qt-app-2',
            sourceId: 'src-apprentice-arxiv-selfsup',
            sectionId: 'sec-app-2',
            text: 'We mix real background noise from independent recordings and apply impulse-response reverberation to target vocalisations, measuring whether the nearest-neighbour retrieval rank remains invariant across degraded views while rejecting time-shuffled negatives.',
          },
        ],
      },
      {
        id: 'sec-app-3',
        heading: '3. Spatio-Temporal Plausibility Constraints',
        text: 'Finally, when synchronized multi-microphone arrays or spatial territories are available, we validate unsupervised cluster assignments against physical plausibility constraints: a single individual cannot vocalise simultaneously at two sensors separated by two kilometres, providing a label-free upper bound on false merge rates.',
        npc: {
          name: 'Brother Aldous',
          role: 'Chronicle Keeper',
        },
        explanation:
          'Physics gives us a free evaluation metric! One bird cannot sing in two places two kilometres apart at the exact same second — so any cluster that merges simultaneous distant calls is provably a false merge!',
        followUps: {
          whatDoYouMean:
            'Simultaneous recordings on distant sensors must come from different individuals. Counting how often your clusterer groups them together measures your false merge rate with zero human labels.',
          whyBelieveYou:
            'It is grounded in physical impossibility rather than subjective human spectrogram inspection.',
          verbatimLine:
            'a single individual cannot vocalise simultaneously at two sensors separated by two kilometres, providing a label-free upper bound on false merge rates.',
        },
        quoteTokens: [
          {
            id: 'qt-app-3',
            sourceId: 'src-apprentice-arxiv-selfsup',
            sectionId: 'sec-app-3',
            text: 'a single individual cannot vocalise simultaneously at two sensors separated by two kilometres, providing a label-free upper bound on false merge rates.',
          },
        ],
      },
    ],
    exitQuestion: {
      question:
        'When the target wildlife dataset has zero identity labels, what three complementary strategies does this preprint use to evaluate open-set individual representations?',
      expectedAnswer:
        'It combines zero-shot open-set transfer on labelled proxy datasets from related taxa (with 50% held-out distractors), an unsupervised noise/reverberation invariance audit on target calls, and spatio-temporal physical plausibility constraints (e.g. simultaneous calls at distant sensors cannot be the same individual).',
      supportingQuoteIds: ['qt-app-1', 'qt-app-2', 'qt-app-3'],
    },
  },
  {
    id: 'src-wizard-journal-openset',
    title: 'Acoustic Individual Identification in Wild Populations: Open-Set Protocols and Unsupervised Benchmarks',
    authors: ['D. Stowell', 'T. Petruskova', 'M. Salek'],
    year: 2019,
    url: 'https://doi.org/10.1111/2041-210X.13103',
    doi: '10.1111/2041-210X.13103',
    venue: 'Methods in Ecology and Evolution',
    venueType: 'peer_reviewed',
    citationCount: 112,
    tier: 'wizard',
    tierReasons: [
      'Peer-reviewed journal article in Methods in Ecology and Evolution (DOI verified)',
      '112 citations — rigorous experimental methodology establishing cross-recording open-set protocols',
    ],
    theme: 'Open-Set Biometric Evaluation Protocols',
    summary:
      'Peer-reviewed journal study demonstrating that within-session evaluation overestimates accuracy by up to 40% and defining open-set gallery-probe protocols.',
    verified: true,
    connected: true,
    abstract:
      'Automatic acoustic identification of individual animals promises non-invasive population monitoring, but published evaluations frequently suffer from session confounding and closed-set assumptions. Here we formalise cross-session open-set evaluation protocols and unsupervised clustering validation.',
    licence: 'CC BY 4.0',
    sections: [
      {
        id: 'sec-wiz-1',
        heading: '1. The Session Confounding Fallacy',
        text: 'Across four avian species, classifiers evaluated on random syllable splits within the same recording session achieved 91% apparent accuracy, but dropped to 52% when tested on vocalisations from the same individuals recorded on different days. Evaluation protocols must strictly partition enrollment and probe sets across independent recording sessions.',
        npc: {
          name: 'Magister Vance',
          role: 'Observatory Scholar',
        },
        explanation:
          'Behold the numbers in our stone tablet: random syllable splits within the same session gave 91% accuracy, yet collapsed to 52% across different days! You must partition enrollment and probe calls across independent recording sessions.',
        followUps: {
          whatDoYouMean:
            'Within a single recording session, background acoustics and bird posture remain static. Only cross-day testing proves the model learned vocal identity.',
          whyBelieveYou:
            'We demonstrated an almost 40 percentage point drop across four distinct bird species under controlled peer-reviewed experiments.',
          verbatimLine:
            'Evaluation protocols must strictly partition enrollment and probe sets across independent recording sessions.',
        },
        quoteTokens: [
          {
            id: 'qt-wiz-1',
            sourceId: 'src-wizard-journal-openset',
            sectionId: 'sec-wiz-1',
            text: 'Across four avian species, classifiers evaluated on random syllable splits within the same recording session achieved 91% apparent accuracy, but dropped to 52% when tested on vocalisations from the same individuals recorded on different days.',
          },
          {
            id: 'qt-wiz-2',
            sourceId: 'src-wizard-journal-openset',
            sectionId: 'sec-wiz-1',
            text: 'Evaluation protocols must strictly partition enrollment and probe sets across independent recording sessions.',
          },
        ],
      },
      {
        id: 'sec-wiz-2',
        heading: '2. Varying the Openness Ratio',
        text: 'Real ecological surveys vary dramatically in the ratio of known gallery individuals to unknown transient individuals. An evaluation must sweep the openness ratio — defined as the fraction of probe individuals absent from the enrollment gallery — from 0% (closed-set) to 80% (highly open-set) and report the Area Under the Open-Set ROC Curve (AUOSROC).',
        npc: {
          name: 'Astrolabe Seraphina',
          role: 'Star-Chart Methodologist',
        },
        explanation:
          'A single open-set split is not enough! You must sweep the openness ratio — the fraction of probe animals absent from your gallery — from 0% up to 80% and report the Area Under the Open-Set ROC Curve.',
        followUps: {
          whatDoYouMean:
            'As more unknown animals enter the habitat, false acceptances compound. Sweeping the openness ratio reveals how gracefully your identifier degrades.',
          whyBelieveYou:
            'A method that works at 10% openness often collapses at 70% openness.',
          verbatimLine:
            'An evaluation must sweep the openness ratio — defined as the fraction of probe individuals absent from the enrollment gallery — from 0% (closed-set) to 80% (highly open-set) and report the Area Under the Open-Set ROC Curve (AUOSROC).',
        },
        quoteTokens: [
          {
            id: 'qt-wiz-3',
            sourceId: 'src-wizard-journal-openset',
            sectionId: 'sec-wiz-2',
            text: 'An evaluation must sweep the openness ratio — defined as the fraction of probe individuals absent from the enrollment gallery — from 0% (closed-set) to 80% (highly open-set) and report the Area Under the Open-Set ROC Curve (AUOSROC).',
          },
        ],
      },
      {
        id: 'sec-wiz-3',
        heading: '3. Acoustic Repertoire Independence',
        text: 'Many vocalising species possess large syllable repertoires or change song types across seasons. To verify individual identity rather than syllable-type matching, open-set benchmarks should evaluate whether embeddings cluster individuals across distinct call types or whether identification is restricted to homologous phrase comparisons.',
        npc: {
          name: 'Archivist Thorne',
          role: 'Harmonic Astronomer',
        },
        explanation:
          'Remember that animals sing many different syllable types! Your evaluation must test whether your method only works on identical phrase types or can recognize the same individual across different song types.',
        followUps: {
          whatDoYouMean:
            'If Bird A sings Phrase X today and Phrase Y tomorrow, a naive spectrogram matcher will think they are two different birds.',
          whyBelieveYou:
            'Separating repertoire variation from individual vocal tract signature is essential for longitudinal monitoring.',
          verbatimLine:
            'To verify individual identity rather than syllable-type matching, open-set benchmarks should evaluate whether embeddings cluster individuals across distinct call types or whether identification is restricted to homologous phrase comparisons.',
        },
        quoteTokens: [
          {
            id: 'qt-wiz-4',
            sourceId: 'src-wizard-journal-openset',
            sectionId: 'sec-wiz-3',
            text: 'To verify individual identity rather than syllable-type matching, open-set benchmarks should evaluate whether embeddings cluster individuals across distinct call types or whether identification is restricted to homologous phrase comparisons.',
          },
        ],
      },
    ],
    exitQuestion: {
      question:
        'What happened to identification accuracy when tested across different days rather than within the same session, and how should an evaluation test varying proportions of unknown animals?',
      expectedAnswer:
        'Apparent accuracy dropped from 91% within-session to 52% across different days due to session confounding, and evaluations must sweep the openness ratio (from 0% to 80% unknown probe individuals) and report AUOSROC.',
      supportingQuoteIds: ['qt-wiz-1', 'qt-wiz-2', 'qt-wiz-3'],
    },
  },
  {
    id: 'src-archmage-survey-review',
    title: 'Computational Bioacoustics for Individual and Population Monitoring: A Comprehensive Survey and Evaluation Taxonomy',
    authors: ['D. Stowell', 'M. Wood', 'H. Pamula', 'Y. Stylianou', 'H. Glotin'],
    year: 2022,
    url: 'https://doi.org/10.1098/rstb.2021.0154',
    doi: '10.1098/rstb.2021.0154',
    venue: 'Philosophical Transactions of the Royal Society B (Survey Review)',
    venueType: 'survey_review_textbook',
    citationCount: 385,
    tier: 'archmage',
    tierReasons: [
      'Authoritative peer-reviewed survey paper in Philosophical Transactions of the Royal Society B',
      '385 citations — synthesizes the entire field of computational bioacoustics and establishes the gold-standard evaluation taxonomy',
    ],
    theme: 'Foundational Surveys & Gold-Standard Taxonomies',
    summary:
      'Landmark 385-citation survey establishing a three-tier validation framework for unlabelled open-set wildlife identification.',
    verified: true,
    connected: false, // Demonstrates the Unconnected World (paywalled/abstract-only wing) in M1/M2!
    abstract:
      'Identifying individual animals from passive acoustic recordings without manual identity labels requires a multi-layered validation strategy. In this comprehensive review, we synthesize over 180 studies and establish a gold-standard evaluation protocol: (1) cross-session open-set verification on held-out proxy populations (reporting DIR@FAR and EER), (2) acoustic perturbation and channel-invariance stress tests on unlabelled target recordings, and (3) ecological and spatial mark-recapture consistency validation before deploying population abundance estimates.',
    licence: 'Royal Society Publishing (Abstract Available; Full Text Behind Publisher Gate)',
    exitQuestion: {
      question:
        'Based on the Archmage survey abstract, what are the three layers of the gold-standard validation protocol when target vocalisations lack manual identity labels?',
      expectedAnswer:
        'The three layers are: (1) cross-session open-set verification on held-out proxy populations reporting DIR@FAR and EER, (2) acoustic perturbation and channel-invariance stress tests on the unlabelled target recordings, and (3) ecological and spatial mark-recapture consistency validation.',
      supportingQuoteIds: [],
    },
  },
];

/**
 * Returns the validated list of sample `Source[]` objects for Milestone 1,
 * ordered along the recommended reading path (Imp -> Goblin -> Apprentice -> Wizard -> Archmage).
 *
 * @returns Array of substring-validated `Source` items.
 */
export function getSampleSources(): Source[] {
  logFunctionCall('getSampleSources', { count: RAW_SAMPLE_SOURCES.length });
  return RAW_SAMPLE_SOURCES.map((source) => validateSourceSubstrings(source));
}
