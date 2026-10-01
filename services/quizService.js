const axios = require("axios");
const { generateChatCompletion } = require("../utils/groq");

// Open Trivia DB Category IDs
const OPENTDB_CATEGORIES = {
  "Computer Science": 18,
  "Mathematics": 19,
  "Science & Nature": 17,
  "General Knowledge": 9,
  "Gadgets & Tech": 30,
};

function safeParseJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(text);
  } catch (e1) {
    // 2. Escape invalid backslashes (like \times, \sqrt, \alpha, \frac, \mu, etc.)
    try {
      const sanitized = text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      return JSON.parse(sanitized);
    } catch (e2) {
      console.warn("safeParseJson failed after sanitize:", e2.message);
      return null;
    }
  }
}

// =========================================================
// OFFICIAL CHAPTER-WISE & SUBJECT-WISE EXAM SYLLABUS
// =========================================================
const EXAM_PRESETS = [
  {
    id: "jee",
    name: "JEE (Main & Advanced)",
    badge: "Engineering",
    icon: "📐",
    description: "Chapter-wise Physics, Chemistry, and Mathematics matching NTA & IIT JEE standards.",
    subjects: [
      {
        name: "Physics",
        topics: [
          "Units, Dimensions & Errors",
          "Kinematics & Motion in 1D/2D",
          "Newton's Laws of Motion & Friction",
          "Work, Energy, Power & Collisions",
          "Rotational Dynamics & Moment of Inertia",
          "Gravitation & Planetary Motion",
          "Mechanical Properties of Solids & Fluids",
          "Thermodynamics & Kinetic Theory of Gases",
          "Oscillations (SHM) & Waves",
          "Electrostatics, Gauss Law & Capacitors",
          "Current Electricity & DC Circuits",
          "Magnetic Effects of Current & Magnetism",
          "Electromagnetic Induction (EMI) & AC",
          "Ray Optics & Optical Instruments",
          "Wave Optics & Interference",
          "Dual Nature of Radiation & Matter",
          "Atoms, Nuclei & Nuclear Physics",
          "Semiconductor Electronics & Logic Gates",
        ],
      },
      {
        name: "Chemistry",
        topics: [
          "Mole Concept & Stoichiometry",
          "Atomic Structure & Quantum Numbers",
          "Periodic Classification & Periodicity",
          "Chemical Bonding & Molecular Structure",
          "Chemical Thermodynamics & Energetics",
          "Chemical & Ionic Equilibrium",
          "Redox Reactions & Electrochemistry",
          "Chemical Kinetics & Rate Laws",
          "Solutions & Colligative Properties",
          "General Organic Chemistry (GOC) & Isomerism",
          "Hydrocarbons (Alkanes, Alkenes, Alkynes)",
          "Haloalkanes & Haloarenes",
          "Alcohols, Phenols & Ethers",
          "Aldehydes, Ketones & Carboxylic Acids",
          "Amines & Nitrogen Compounds",
          "Coordination Compounds & d-Block Elements",
          "Biomolecules & Polymers",
        ],
      },
      {
        name: "Mathematics",
        topics: [
          "Sets, Relations & Functions",
          "Complex Numbers & Quadratic Equations",
          "Matrices & Determinants",
          "Permutations & Combinations",
          "Binomial Theorem & Mathematical Induction",
          "Sequences & Series (AP, GP, HP)",
          "Limits, Continuity & Differentiability",
          "Applications of Derivatives (Max/Min)",
          "Indefinite & Definite Integrals",
          "Differential Equations & Area Under Curves",
          "Straight Lines & Circles",
          "Conic Sections (Parabola, Ellipse, Hyperbola)",
          "Vector Algebra & 3D Geometry",
          "Trigonometric Functions & Equations",
          "Probability & Statistics",
        ],
      },
    ],
  },
  {
    id: "neet",
    name: "NEET (Medical UG)",
    badge: "Medical",
    icon: "🧬",
    description: "Official NCERT Chapter-wise Biology (Botany & Zoology), Chemistry, and Physics.",
    subjects: [
      {
        name: "Botany",
        topics: [
          "The Living World & Biological Classification",
          "Plant Kingdom & Algae/Fungi",
          "Morphology & Anatomy of Flowering Plants",
          "Cell: The Unit of Life & Cell Cycle",
          "Photosynthesis in Higher Plants",
          "Respiration in Plants & Plant Growth",
          "Sexual Reproduction in Flowering Plants",
          "Principles of Inheritance & Variation (Genetics)",
          "Molecular Basis of Inheritance (DNA/RNA)",
          "Biotechnology: Principles & Processes",
          "Biotechnology & Its Applications",
          "Organisms, Populations & Ecosystems",
          "Biodiversity and its Conservation",
        ],
      },
      {
        name: "Zoology",
        topics: [
          "Animal Kingdom & Classification",
          "Structural Organisation in Animals & Tissues",
          "Digestion and Absorption",
          "Breathing and Exchange of Gases",
          "Body Fluids and Circulation",
          "Excretory Products and Their Elimination",
          "Locomotion and Movement",
          "Neural Control and Chemical Coordination",
          "Human Reproduction & Embryonic Development",
          "Reproductive Health & Contraception",
          "Human Health and Diseases & Immunity",
          "Evolution & Origin of Life",
        ],
      },
      {
        name: "Physics for NEET",
        topics: [
          "Units, Measurements & Motion in a Plane",
          "Laws of Motion & Work-Energy Theorem",
          "System of Particles & Rotational Motion",
          "Gravitation & Properties of Bulk Matter",
          "Thermodynamics & Kinetic Theory",
          "Oscillations & Waves",
          "Electrostatics & Current Electricity",
          "Magnetic Effects & Electromagnetic Induction",
          "Ray Optics, Wave Optics & Dual Nature",
          "Atoms, Nuclei & Semiconductor Devices",
        ],
      },
      {
        name: "Chemistry for NEET",
        topics: [
          "Basic Concepts of Chemistry & Structure of Atom",
          "Chemical Bonding & Periodic Properties",
          "Chemical Thermodynamics & Equilibrium",
          "Electrochemistry & Chemical Kinetics",
          "General Organic Chemistry (GOC)",
          "Hydrocarbons & Reaction Mechanisms",
          "Oxygen & Nitrogen Containing Compounds",
          "Coordination Chemistry & d/f-Block Elements",
          "Biomolecules & Environmental Chemistry",
        ],
      },
    ],
  },
  {
    id: "gate-cs",
    name: "GATE (Computer Science & IT)",
    badge: "Post-Graduate",
    icon: "💻",
    description: "Complete chapter-wise syllabus covering Core CS, Engineering Math, and System Design.",
    subjects: [
      {
        name: "Data Structures & Algorithms",
        topics: [
          "Asymptotic Analysis & Recurrences",
          "Arrays, Linked Lists, Stacks & Queues",
          "Binary Trees, BSTs & AVL Trees",
          "Heaps & Priority Queues",
          "Hashing & Collision Resolution",
          "Graph Algorithms (BFS, DFS, Dijkstra, Bellman-Ford)",
          "Greedy Algorithms & Minimum Spanning Trees (MST)",
          "Dynamic Programming & Knapsack/LCS",
          "Divide & Conquer, Sorting & Searching",
        ],
      },
      {
        name: "Operating Systems",
        topics: [
          "Processes, Threads & CPU Scheduling Algorithms",
          "Process Synchronization (Semaphores, Mutex, Monitors)",
          "Deadlock Detection, Prevention & Banker's Algorithm",
          "Memory Management (Paging, Segmentation, TLB)",
          "Virtual Memory & Page Replacement Algorithms",
          "File Systems & Disk Scheduling (SCAN, C-LOOK)",
        ],
      },
      {
        name: "Database Management Systems (DBMS)",
        topics: [
          "ER Diagrams & Relational Model Mapping",
          "Relational Algebra & Tuple Relational Calculus",
          "SQL Queries, Joins, Group By & Subqueries",
          "Functional Dependencies & Normalization (1NF to BCNF)",
          "Transactions & ACID Properties",
          "Concurrency Control (2PL, Timestamp, Serializability)",
          "Indexing, B-Trees & B+ Trees",
        ],
      },
      {
        name: "Computer Networks",
        topics: [
          "OSI vs TCP/IP Architecture & Layering",
          "Data Link Protocols & Error Detection (CRC, Sliding Window)",
          "Medium Access Control (CSMA/CD, Ethernet)",
          "IPv4 & IPv6 Addressing, Subnetting & CIDR",
          "Routing Protocols (Dijkstra, Bellman-Ford, OSPF, BGP)",
          "Transport Layer (TCP Handshake, Flow/Congestion Control, UDP)",
          "Application Protocols (DNS, HTTP, SMTP, DHCP)",
        ],
      },
      {
        name: "Theory of Computation & Compiler Design",
        topics: [
          "DFA, NFA & Regular Expressions",
          "Pumping Lemma & Closure Properties of Regular Languages",
          "Context-Free Grammars (CFG) & Pushdown Automata (PDA)",
          "Turing Machines, Decidability & Halting Problem",
          "Lexical Analysis & First/Follow Computation",
          "Top-Down (LL1) & Bottom-Up Parsing (LR, LALR)",
          "Syntax-Directed Translation & Intermediate Code",
        ],
      },
      {
        name: "Digital Logic & Computer Organization",
        topics: [
          "Boolean Algebra, Minimization & K-Maps",
          "Combinational Circuits (Multiplexers, Decoders, Adders)",
          "Sequential Circuits (Flip-Flops, Counters, Registers)",
          "Instruction Pipelining & Hazard Handling",
          "Cache Memory Mapping (Direct, Set-Associative)",
          "Memory Hierarchy & Virtual Memory Addressing",
        ],
      },
    ],
  },
  {
    id: "aptitude",
    name: "Campus Placements & Aptitude",
    badge: "Placements",
    icon: "📊",
    description: "Quantitative, Logical Reasoning, and Verbal ability for placement test preparation.",
    subjects: [
      {
        name: "Quantitative Aptitude",
        topics: [
          "Percentages, Profit, Loss & Discount",
          "Simple Interest & Compound Interest",
          "Ratio, Proportion & Mixtures/Alligations",
          "Time, Speed, Distance & Trains/Boats",
          "Time, Work & Pipes and Cisterns",
          "Permutations, Combinations & Probability",
          "Number System, LCM & HCF",
          "Geometry, Mensuration & Trigonometry",
        ],
      },
      {
        name: "Logical & Analytical Reasoning",
        topics: [
          "Blood Relations & Family Tree",
          "Syllogisms & Venn Diagrams",
          "Seating Arrangement (Linear & Circular)",
          "Coding-Decoding & Series Completion",
          "Direction Sense & Order/Ranking",
          "Data Sufficiency & Puzzles",
        ],
      },
      {
        name: "Verbal Ability & English",
        topics: [
          "Reading Comprehension & Critical Reasoning",
          "Sentence Correction & Error Spotting",
          "Vocabulary (Synonyms, Antonyms & Idioms)",
          "Para Jumbles & Sentence Rearrangement",
          "Fill in the Blanks & Cloze Test",
        ],
      },
    ],
  },
  {
    id: "coding",
    name: "Software Engineering & Tech",
    badge: "Developer",
    icon: "⚡",
    description: "Full-stack development, Python, JavaScript, React, SQL, and system design.",
    subjects: [
      {
        name: "Modern Web & Programming",
        topics: [
          "Python Core, OOP & Magic Methods",
          "JavaScript (ES6+, Promises, Async/Await, Event Loop)",
          "React.js (Hooks, Virtual DOM, State & Performance)",
          "Node.js, Express & Microservices",
          "SQL & NoSQL Database Architecture",
          "Data Structures in C++/Java (Trees, Graphs, DP)",
        ],
      },
    ],
  },
  {
    id: "opentdb",
    name: "General Science & Tech Trivia",
    badge: "Open Trivia API",
    icon: "🌐",
    description: "Powered by Open Trivia DB free public quiz API.",
    subjects: [
      {
        name: "Public API Quizzes",
        topics: [
          "Computer Science",
          "Mathematics",
          "Science & Nature",
          "General Knowledge",
          "Gadgets & Tech",
        ],
      },
    ],
  },
];

// Open Trivia DB Fetcher
async function fetchFromOpenTriviaDB({ topic, count = 10, difficulty = "medium" }) {
  const categoryId = OPENTDB_CATEGORIES[topic] || OPENTDB_CATEGORIES["Computer Science"];
  const diff = difficulty.toLowerCase();

  const url = `https://opentdb.com/api.php?amount=${count}&category=${categoryId}&difficulty=${diff}&type=multiple`;
  const res = await axios.get(url, { timeout: 5000 });

  if (!res.data || !res.data.results || res.data.results.length === 0) {
    throw new Error("No questions returned from OpenTDB");
  }

  const decodeHtml = (html) => {
    if (!html) return "";
    return html
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&deg;/g, "°");
  };

  return res.data.results.map((q, idx) => {
    const questionText = decodeHtml(q.question);
    const correctOpt = decodeHtml(q.correct_answer);
    const incorrectOpts = (q.incorrect_answers || []).map(decodeHtml);

    const allOptions = [...incorrectOpts, correctOpt];
    for (let i = allOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    const correctIndex = allOptions.indexOf(correctOpt);

    return {
      id: idx + 1,
      question: questionText,
      options: allOptions,
      correctAnswer: correctIndex,
      explanation: `The correct answer is: "${correctOpt}". Verified via Open Trivia Database.`,
    };
  });
}

// =========================================================
// GROQ AI EXAM QUESTION GENERATOR WITH PARALLEL CHUNKING
// =========================================================
async function generateExamQuestionsWithAI({ examType, subject, topic, count = 5, difficulty = "Medium" }) {
  const targetTopic = topic || subject || "Core Concepts";
  const targetSubject = subject || "General";
  const targetExam = examType || "Competitive Exam";
  const totalCount = Math.max(3, Math.min(20, parseInt(count, 10) || 5));

  // Chunk total into manageable batches of at most 5 questions each
  const batchSizes = [];
  let remaining = totalCount;
  while (remaining > 0) {
    const size = Math.min(5, remaining);
    batchSizes.push(size);
    remaining -= size;
  }

  const batchThemes = [
    "Fundamental definitions, core laws, and standard principles",
    "Numerical problem solving, formula applications, and calculations",
    "Conceptual reasoning, assertions, and graphical interpretation",
    "Advanced multi-step problems and competitive exam edge cases",
  ];

  const fetchBatch = async (batchSize, batchIdx) => {
    const themeNote = batchThemes[batchIdx % batchThemes.length];

    const systemPrompt = `You are a premier senior test-maker for Indian competitive examinations including ${targetExam}.
Your task is to generate high-quality multiple choice questions (MCQs) STRICTLY AND EXCLUSIVELY covering the requested Chapter / Topic: "${targetTopic}" within Subject: "${targetSubject}".

STRICT RULES:
1. Every single question MUST be 100% relevant to "${targetTopic}" (Subject: ${targetSubject}). Never include questions from other subjects or unrelated topics.
2. Focus on: ${themeNote}.
3. Provide exactly 4 options per question (Option A, B, C, D).
4. Specify "correctAnswer" as an integer index from 0 to 3 pointing to the correct option.
5. Include a concise, 1-2 sentence explanation with the core concept or formula.
6. Write mathematical equations in plain text/unicode (e.g., sqrt(x), x^2, θ, λ, μ, ×, ±, Ω) rather than raw LaTeX with backslashes so JSON stays valid.
7. Output ONLY a valid JSON object matching the requested schema.`;

    const userPrompt = `Generate exactly ${batchSize} multiple choice questions for ${targetExam} -> ${targetSubject} -> "${targetTopic}" (${difficulty} level).

Output JSON schema:
{
  "questions": [
    {
      "question": "Question statement on ${targetTopic}...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why Option A is correct..."
    }
  ]
}`;

    try {
      const aiResponse = await generateChatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 2500,
      });

      const raw = (aiResponse.content || "").trim();
      const parsed = safeParseJson(raw);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed.questions.map((q) => ({
          question: q.question,
          options: Array.isArray(q.options) && q.options.length === 4 ? q.options : ["Option A", "Option B", "Option C", "Option D"],
          correctAnswer: typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < 4 ? q.correctAnswer : 0,
          explanation: q.explanation || `The correct answer is derived from principles of ${targetTopic}.`,
        }));
      }
    } catch (err) {
      console.warn(`[QuizGen] Batch ${batchIdx + 1} AI generation failed:`, err.message);
    }
    return [];
  };

  try {
    // Run batches in parallel
    const batchResults = await Promise.all(
      batchSizes.map((size, idx) => fetchBatch(size, idx))
    );

    const mergedQuestions = batchResults.flat().filter(Boolean);

    if (mergedQuestions.length >= Math.min(3, totalCount)) {
      // Re-index questions cleanly
      return mergedQuestions.slice(0, totalCount).map((q, idx) => ({
        id: idx + 1,
        ...q,
      }));
    }
  } catch (err) {
    console.error(`[QuizGen] Parallel batch generation error:`, err.message);
  }

  // Topic-accurate fallback if AI unavailable
  return generateTopicAccurateFallback({
    examType: targetExam,
    subject: targetSubject,
    topic: targetTopic,
    count: totalCount,
    difficulty,
  });
}

// =========================================================
// TOPIC-ACCURATE FALLBACK BANK (STRICT DOMAIN MATCHING)
// =========================================================
function generateTopicAccurateFallback({ examType, subject, topic, count = 5, difficulty = "Medium" }) {
  const lower = (topic + " " + subject + " " + examType).toLowerCase();

  // PHYSICS (Units, Dimensions, Errors, Kinematics, Mechanics, Dynamics, Optics, Electromagnetism)
  if (
    lower.includes("physics") ||
    lower.includes("unit") ||
    lower.includes("dimension") ||
    lower.includes("error") ||
    lower.includes("kinematics") ||
    lower.includes("motion") ||
    lower.includes("mechanic") ||
    lower.includes("laws of motion") ||
    lower.includes("rotational") ||
    lower.includes("electrostat") ||
    lower.includes("optic")
  ) {
    const physicsPool = [
      {
        question: "The dimensional formula for Planck's constant (h) is equal to that of:",
        options: ["Angular Momentum", "Linear Momentum", "Work", "Power"],
        correctAnswer: 0,
        explanation: "Energy E = hν => [h] = [E] / [ν] = (M L² T⁻²) / (T⁻¹) = M L² T⁻¹. Angular momentum L = mvr => [L] = M * (L T⁻¹) * L = M L² T⁻¹. Hence [h] = [L].",
      },
      {
        question: "In an experiment to measure the density of a cube, the percentage error in mass is 1.5% and the percentage error in length is 1%. What is the maximum percentage error in the measurement of density?",
        options: ["4.5%", "2.5%", "3.5%", "1.5%"],
        correctAnswer: 0,
        explanation: "Density ρ = M / V = M / L³. Maximum relative error Δρ/ρ = ΔM/M + 3(ΔL/L) = 1.5% + 3(1%) = 4.5%.",
      },
      {
        question: "Which of the following physical quantities is dimensionless?",
        options: ["Relative Permeability", "Permittivity of Free Space", "Universal Gas Constant", "Gravitational Constant"],
        correctAnswer: 0,
        explanation: "Relative permeability (μ_r = μ / μ₀) is the ratio of two identical physical quantities (permeabilities), making it a dimensionless scalar.",
      },
      {
        question: "A particle starts from rest and moves with uniform acceleration 'a'. What is the ratio of the distance travelled in the 5th second to that travelled in the 5th total second?",
        options: ["9 : 25", "5 : 25", "1 : 5", "9 : 16"],
        correctAnswer: 0,
        explanation: "Distance in nth second is S_n = u + a/2(2n - 1) = a/2(9) for n=5. Total distance in 5 seconds is S_total = 1/2 a (5)^2 = 25a/2. Ratio = (9a/2) / (25a/2) = 9 : 25.",
      },
      {
        question: "A body of mass m is projected with velocity v at an angle θ with the horizontal. What is its kinetic energy at the highest point of its trajectory?",
        options: ["1/2 m v²", "1/2 m v² cos²θ", "1/2 m v² sin²θ", "Zero"],
        correctAnswer: 1,
        explanation: "At the maximum height of projectile motion, the vertical velocity is zero and the horizontal component remains v_x = v cosθ. Thus KE = 1/2 m (v cosθ)² = 1/2 m v² cos²θ.",
      },
      {
        question: "The moment of inertia of a uniform thin rod of mass M and length L about an axis passing through one of its ends and perpendicular to its length is:",
        options: ["ML² / 12", "ML² / 3", "ML² / 2", "2/3 ML²"],
        correctAnswer: 1,
        explanation: "By Parallel Axis Theorem, I_end = I_cm + M(L/2)² = ML²/12 + ML²/4 = ML²/3.",
      },
      {
        question: "A block of mass 2 kg is placed on a rough horizontal surface with coefficient of static friction μ_s = 0.4. If a force of 6 N is applied horizontally, the frictional force acting on the block is (g = 10 m/s²):",
        options: ["8 N", "6 N", "4 N", "Zero"],
        correctAnswer: 1,
        explanation: "Maximum limiting static friction f_max = μ_s N = 0.4 * 20 = 8 N. Since the applied force (6 N) is less than f_max, the block does not move and static friction equals the applied force (6 N).",
      },
      {
        question: "Two bodies of masses m₁ and m₂ have equal kinetic energies. What is the ratio of their linear momenta p₁ : p₂?",
        options: ["m₁ : m₂", "√m₁ : √m₂", "m₂ : m₁", "m₁² : m₂²"],
        correctAnswer: 1,
        explanation: "Kinetic energy E = p² / (2m), so momentum p = √(2mE). For equal kinetic energy, p₁ / p₂ = √(m₁) / √(m₂).",
      },
    ];

    const result = [];
    for (let i = 0; i < count; i++) {
      const q = physicsPool[i % physicsPool.length];
      result.push({
        id: i + 1,
        ...q,
      });
    }
    return result;
  }

  // BIOLOGY / NEET (Botany, Zoology, Genetics, Human Physiology, Cell)
  if (lower.includes("biolog") || lower.includes("botany") || lower.includes("zoology") || lower.includes("genetics") || lower.includes("physiolog") || lower.includes("cell") || lower.includes("neet")) {
    return [
      {
        id: 1,
        question: "In a classic Mendelian dihybrid cross (RrYy × RrYy), what is the expected phenotypic ratio in the F2 generation?",
        options: ["9 : 3 : 3 : 1", "1 : 2 : 1", "3 : 1", "9 : 7"],
        correctAnswer: 0,
        explanation: "Mendel's Law of Independent Assortment produces a standard 9:3:3:1 phenotypic ratio (Round-Yellow : Round-Green : Wrinkled-Yellow : Wrinkled-Green) in the F2 generation.",
      },
      {
        id: 2,
        question: "Which of the following cellular organelles is referred to as the 'semi-autonomous organelle' containing its own 70S ribosomes and circular DNA?",
        options: ["Golgi Apparatus", "Mitochondria", "Lysosome", "Endoplasmic Reticulum"],
        correctAnswer: 1,
        explanation: "Mitochondria and Chloroplasts possess their own double-stranded circular DNA molecules, RNA, and 70S ribosomes, enabling them to synthesize some of their own proteins.",
      },
      {
        id: 3,
        question: "In human physiology, which hormone is secreted by the juxtaglomerular cells of the kidney in response to a fall in glomerular blood pressure?",
        options: ["Aldosterone", "Renin", "Angiotensinogen", "Atrial Natriuretic Factor (ANF)"],
        correctAnswer: 1,
        explanation: "A decrease in glomerular blood flow/pressure activates juxtaglomerular cells to release Renin, which converts angiotensinogen into angiotensin I to trigger the RAAS pathway.",
      },
      {
        id: 4,
        question: "During photosynthesis, the light-independent reactions (Calvin Cycle / C3 pathway) take place in the:",
        options: ["Thylakoid Membrane", "Stroma of Chloroplast", "Granum", "Peroxisome"],
        correctAnswer: 1,
        explanation: "The light reaction takes place in the thylakoid membranes, while the enzymatic dark reactions (Calvin Cycle fixing CO2 into sugars) occur in the stroma of the chloroplast.",
      },
      {
        id: 5,
        question: "Which blood group in the ABO system is designated as the universal donor because its RBCs lack both A and B surface antigens?",
        options: ["AB Positive", "O Negative", "A Positive", "B Negative"],
        correctAnswer: 1,
        explanation: "O Negative red blood cells lack A, B, and Rh surface antigens, preventing agglutination when transfused to recipients of any blood group.",
      },
    ].slice(0, count);
  }

  // CHEMISTRY (Organic, Inorganic, Physical, Bonding, Equilibrium)
  if (lower.includes("chem") || lower.includes("bonding") || lower.includes("reaction") || lower.includes("organic") || lower.includes("equilibrium") || lower.includes("thermodynamics")) {
    return [
      {
        id: 1,
        question: "According to VSEPR theory, what is the geometric molecular shape and hybridisation of the central Xenon atom in XeF₄?",
        options: ["Square Planar, sp³d²", "Tetrahedral, sp³", "Square Pyramidal, sp³d", "Octahedral, d²sp³"],
        correctAnswer: 0,
        explanation: "In XeF₄, Xe has 8 valence electrons: 4 bonding pairs with Fluorine and 2 lone pairs. Steric number = 6 (sp³d² hybridisation). The 2 lone pairs occupy axial positions, producing a Square Planar geometry.",
      },
      {
        id: 2,
        question: "Which of the following carbocations is the most stable due to maximum hyperconjugation and inductive effect?",
        options: ["Tert-butyl cation (CH₃)₃C⁺", "Isopropyl cation (CH₃)₂CH⁺", "Ethyl cation CH₃CH₂⁺", "Methyl cation CH₃⁺"],
        correctAnswer: 0,
        explanation: "The tert-butyl cation (CH₃)₃C⁺ has 9 α-hydrogens for hyperconjugation and three electron-donating +I methyl groups, making it significantly more stable than secondary, primary, or methyl cations.",
      },
      {
        id: 3,
        question: "For a first-order chemical reaction, if the rate constant k is 0.0693 min⁻¹, what is the half-life period (t₁/₂) of the reaction?",
        options: ["10 minutes", "100 minutes", "0.693 minutes", "5 minutes"],
        correctAnswer: 0,
        explanation: "For a first-order reaction, t₁/₂ = 0.693 / k = 0.693 / 0.0693 = 10 minutes.",
      },
      {
        id: 4,
        question: "In the coordination complex [Fe(CN)₆]³⁻, what is the magnetic behavior and d-orbital splitting?",
        options: ["Paramagnetic with 1 unpaired electron (Low Spin)", "Diamagnetic (No unpaired electrons)", "High spin paramagnetic with 5 unpaired electrons", "Ferromagnetic"],
        correctAnswer: 0,
        explanation: "CN⁻ is a strong field ligand that forces pairing in Fe³⁺ (d⁵ configuration, t₂g⁵ eg⁰), leaving exactly 1 unpaired electron in the t₂g set, making it low-spin paramagnetic.",
      },
      {
        id: 5,
        question: "What is the pH of a 10⁻⁸ M aqueous solution of hydrochloric acid (HCl) at 25°C taking water dissociation into account?",
        options: ["8.00", "6.98", "7.00", "1.00"],
        correctAnswer: 1,
        explanation: "Total [H⁺] = [H⁺]_acid + [H⁺]_water = 10⁻⁸ + 10⁻⁷ = 1.1 × 10⁻⁷ M. pH = -log(1.1 × 10⁻⁷) ≈ 6.98 (slightly acidic, not basic).",
      },
    ].slice(0, count);
  }

  // MATHEMATICS (Calculus, Algebra, Coordinate Geometry, Matrices, Probability)
  if (lower.includes("math") || lower.includes("calculus") || lower.includes("integral") || lower.includes("matrice") || lower.includes("probabilit") || lower.includes("algebra") || lower.includes("geometry")) {
    return [
      {
        id: 1,
        question: "What is the value of the limit lim (x → 0) of (sin(3x) / tan(2x))?",
        options: ["3/2", "2/3", "1", "0"],
        correctAnswer: 0,
        explanation: "lim (x → 0) [ (sin 3x / 3x) * 3x ] / [ (tan 2x / 2x) * 2x ] = (1 * 3) / (1 * 2) = 3/2.",
      },
      {
        id: 2,
        question: "If A is a square matrix of order 3 × 3 such that |A| = 4, what is the determinant of its adjoint matrix |adj(A)|?",
        options: ["16", "64", "4", "12"],
        correctAnswer: 0,
        explanation: "For an n × n matrix, |adj(A)| = |A|^(n - 1). Here n = 3, so |adj(A)| = |A|^(3 - 1) = 4² = 16.",
      },
      {
        id: 3,
        question: "What is the area bounded by the parabola y² = 4x and the line y = 2x?",
        options: ["1/3 sq units", "2/3 sq units", "4/3 sq units", "1/6 sq units"],
        correctAnswer: 0,
        explanation: "Intersection points: (2x)² = 4x => 4x² - 4x = 0 => x = 0 and x = 1. Area = ∫₀¹ (2√x - 2x) dx = [ (4/3)x^(3/2) - x² ]₀¹ = 4/3 - 1 = 1/3 sq units.",
      },
      {
        id: 4,
        question: "Two fair dice are rolled simultaneously. What is the probability that the sum of the numbers obtained is a prime number?",
        options: ["15 / 36", "7 / 18", "5 / 12", "1 / 2"],
        correctAnswer: 0,
        explanation: "Possible prime sums are 2, 3, 5, 7, 11. The favorable outcomes are: Sum 2 (1), Sum 3 (2), Sum 5 (4), Sum 7 (6), Sum 11 (2). Total = 1 + 2 + 4 + 6 + 2 = 15 outcomes out of 36. Probability = 15/36 = 5/12.",
      },
      {
        id: 5,
        question: "The distance between the parallel planes 2x - 2y + z + 3 = 0 and 4x - 4y + 2z + 5 = 0 is:",
        options: ["1/6", "1/3", "1/2", "2/3"],
        correctAnswer: 0,
        explanation: "Normalize second equation: 2x - 2y + z + 2.5 = 0. Distance d = |c₁ - c₂| / √(a² + b² + c²) = |3 - 2.5| / √(4 + 4 + 1) = 0.5 / 3 = 1/6.",
      },
    ].slice(0, count);
  }

  // DEFAULT / CORE CS & GATE
  return [
    {
      id: 1,
      question: `Which fundamental principle governs optimal solutions in "${topic || subject}"?`,
      options: [
        "Optimal substructure and overlapping subproblems",
        "Arbitrary non-deterministic mutation",
        "Infinite recursive unconstrained branching",
        "Omission of boundary constraints",
      ],
      correctAnswer: 0,
      explanation: `In standard curriculum for ${topic || subject}, optimal decision making relies on preserving invariants and verified boundary properties.`,
    },
    {
      id: 2,
      question: "What is the worst-case time complexity of searching an element in a balanced Binary Search Tree (AVL / Red-Black)?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
      correctAnswer: 1,
      explanation: "In a balanced BST, tree height is strictly bounded by O(log n), ensuring lookup, insertion, and deletion run in O(log n) worst-case time.",
    },
    {
      id: 3,
      question: "Which synchronization mechanism uses two atomic operations `wait()` (P) and `signal()` (V) to solve the critical section problem?",
      options: ["Semaphores", "Spinlocks without atomic test", "Shared Global Booleans", "Round Robin Scheduler"],
      correctAnswer: 0,
      explanation: "Dijkstra's Semaphores provide integer variables accessed only through atomic `wait()` (P) and `signal()` (V) primitives to ensure mutual exclusion without busy waiting.",
    },
  ].slice(0, count);
}

module.exports = {
  EXAM_PRESETS,
  fetchFromOpenTriviaDB,
  generateExamQuestionsWithAI,
};
