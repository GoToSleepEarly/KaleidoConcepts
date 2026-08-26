import { compileGrammarBook, type RawGrammarBook } from "../lib/domain/grammar-catalog";

type BookMeta = Omit<RawGrammarBook, "sections"> & { expectedUnitCount: number };

function parseBook(meta: BookMeta, source: string): RawGrammarBook {
  const sections: RawGrammarBook["sections"] = [];
  for (const sourceLine of source.trim().split("\n")) {
    const line = sourceLine.trim();
    if (!line) continue;
    const section = /^\[(.+)]$/.exec(line);
    if (section) {
      sections.push({
        id: `${meta.id}-s${sections.length + 1}`,
        officialTitle: section[1],
        sortOrder: sections.length + 1,
        units: [],
      });
      continue;
    }
    const unit = /^(\d+)\s+(.+)$/.exec(line);
    if (!unit || !sections.length) throw new Error(`Invalid grammar catalog line: ${line}`);
    sections.at(-1)!.units.push({ unitNumber: Number(unit[1]), officialTitle: unit[2] });
  }
  const units = sections.flatMap((section) => section.units);
  if (units.length !== meta.expectedUnitCount) throw new Error(`${meta.title} expected ${meta.expectedUnitCount} units, received ${units.length}`);
  units.forEach((unit, index) => {
    if (unit.unitNumber !== index + 1) throw new Error(`${meta.title} is missing Unit ${index + 1}`);
  });
  return { id: meta.id, title: meta.title, edition: meta.edition, officialLevel: meta.officialLevel, sortOrder: meta.sortOrder, sections };
}

const essential = parseBook({
  id: "essential-grammar-in-use-4",
  title: "Essential Grammar in Use",
  edition: "Fourth Edition",
  officialLevel: "A1–B1",
  sortOrder: 1,
  expectedUnitCount: 115,
}, String.raw`
[Present]
1 am/is/are
2 am/is/are (questions)
3 I am doing (present continuous)
4 are you doing? (present continuous questions)
5 I do/work/like etc. (present simple)
6 I don’t ... (present simple negative)
7 Do you ... ? (present simple questions)
8 I am doing (present continuous) and I do (present simple)
9 I have ... and I’ve got ...
[Past]
10 was/were
11 worked/got/went etc. (past simple)
12 I didn’t ... Did you ... ? (past simple negative and questions)
13 I was doing (past continuous)
14 I was doing (past continuous) and I did (past simple)
[Present perfect]
15 I have done (present perfect 1)
16 I’ve just ... I’ve already ... I haven’t ... yet (present perfect 2)
17 Have you ever ... ? (present perfect 3)
18 How long have you ... ? (present perfect 4)
19 for since ago
20 I have done (present perfect) and I did (past)
[Passive]
21 is done was done (passive 1)
22 is being done has been done (passive 2)
[Verb forms]
23 be/have/do in present and past tenses
24 Regular and irregular verbs
[Future]
25 What are you doing tomorrow?
26 I’m going to ...
27 will/shall 1
28 will/shall 2
[Modals, imperative etc.]
29 might
30 can and could
31 must mustn’t don’t need to
32 should
33 I have to ...
34 Would you like ... ? I’d like ...
35 Do this! Don’t do that! Let’s do this!
36 I used to ...
[There and it]
37 there is there are
38 there was/were there has/have been there will be
39 It ...
[Auxiliary verbs]
40 I am, I don’t etc.
41 Have you? Are you? Don’t you? etc.
42 too/either so am I / neither do I etc.
43 isn’t, haven’t, don’t etc. (negatives)
[Questions]
44 is it ... ? have you ... ? do they ... ? etc. (questions 1)
45 Who saw you? Who did you see? (questions 2)
46 Who is she talking to? What is it like? (questions 3)
47 What ... ? Which ... ? How ... ? (questions 4)
48 How long does it take ... ?
49 Do you know where ... ? I don’t know what ... etc.
[Reported speech]
50 She said that ... He told me that ...
[-ing and to ...]
51 work/working go/going do/doing
52 to ... (I want to do) and -ing (I enjoy doing)
53 I want you to ... I told you to ...
54 I went to the shop to ...
[Go, get, do, make and have]
55 go to ... go on ... go for ... go -ing
56 get
57 do and make
58 have
[Pronouns and possessives]
59 I/me he/him they/them etc.
60 my/his/their etc.
61 Whose is this? It’s mine/yours/hers etc.
62 I/me/my/mine
63 myself/yourself/themselves etc.
64 -’s (Kate’s camera / my brother’s car etc.)
[A and the]
65 a/an ...
66 train(s) bus(es) (singular and plural)
67 a bottle / some water (countable/uncountable 1)
68 a cake / some cake / some cakes (countable/uncountable 2)
69 a/an and the
70 the ...
71 go to work go home go to the cinema
72 I like music I hate exams
73 the ... (names of places)
[Determiners and pronouns]
74 this/that/these/those
75 one/ones
76 some and any
77 not + any no none
78 not + anybody/anyone/anything nobody/no-one/nothing
79 somebody/anything/nowhere etc.
80 every and all
81 all most some any no/none
82 both either neither
83 a lot much many
84 (a) little (a) few
[Adjectives and adverbs]
85 old/nice/interesting etc. (adjectives)
86 quickly/badly/suddenly etc. (adverbs)
87 old/older expensive / more expensive
88 older than ... more expensive than ...
89 not as ... as
90 the oldest the most expensive
91 enough
92 too
[Word order]
93 He speaks English very well. (word order 1)
94 always/usually/often etc. (word order 2)
95 still yet already
96 Give me that book! Give it to me!
[Conjunctions and clauses]
97 and but or so because
98 When ...
99 If we go ... If you see ... etc.
100 If I had ... If we went ... etc.
101 a person who ... a thing that/which ... (relative clauses 1)
102 the people we met the hotel you stayed at (relative clauses 2)
[Prepositions]
103 at 8 o’clock on Monday in April
104 from ... to until since for
105 before after during while
106 in at on (places 1)
107 in at on (places 2)
108 to in at (places 3)
109 under, behind, opposite etc.
110 up, over, through etc.
111 on at by with about
112 afraid of ..., good at ... etc. of/at/for etc. (prepositions) + -ing
113 listen to ..., look at ... etc. (verb + preposition)
[Phrasal verbs]
114 go in, fall off, run away etc. (phrasal verbs 1)
115 put on your shoes put your shoes on (phrasal verbs 2)
`);

const english = parseBook({
  id: "english-grammar-in-use-5",
  title: "English Grammar in Use",
  edition: "Fifth Edition",
  officialLevel: "B1–B2",
  sortOrder: 2,
  expectedUnitCount: 145,
}, String.raw`
[Present and past]
1 Present continuous (I am doing)
2 Present simple (I do)
3 Present continuous and present simple 1 (I am doing and I do)
4 Present continuous and present simple 2 (I am doing and I do)
5 Past simple (I did)
6 Past continuous (I was doing)
[Present perfect and past]
7 Present perfect 1 (I have done)
8 Present perfect 2 (I have done)
9 Present perfect continuous (I have been doing)
10 Present perfect continuous and simple (I have been doing and I have done)
11 how long have you (been) ... ?
12 for and since when ... ? and how long ... ?
13 Present perfect and past 1 (I have done and I did)
14 Present perfect and past 2 (I have done and I did)
15 Past perfect (I had done)
16 Past perfect continuous (I had been doing)
17 have and have got
18 used to (do)
[Future]
19 Present tenses (I am doing / I do) for the future
20 I’m going to (do)
21 will and shall 1
22 will and shall 2
23 I will and I’m going to
24 will be doing and will have done
25 when I do and when I’ve done if and when
[Modals]
26 can, could and (be) able to
27 could (do) and could have (done)
28 must and can’t
29 may and might 1
30 may and might 2
31 have to and must
32 must mustn’t needn’t
33 should 1
34 should 2
35 ’d better ... it’s time ...
36 would
37 can/could/would you ... ? etc. (Requests, offers, permission and invitations)
[if and wish]
38 if I do ... and if I did ...
39 if I knew ... I wish I knew ...
40 if I had known ... I wish I had known ...
41 wish
[Passive]
42 Passive 1 (is done / was done)
43 Passive 2 (be done / been done / being done)
44 Passive 3
45 it is said that ... he is said to ... he is supposed to ...
46 have something done
[Reported speech]
47 Reported speech 1 (he said that ...)
48 Reported speech 2
[Questions and auxiliary verbs]
49 Questions 1
50 Questions 2 (do you know where ... ? / he asked me where ...)
51 Auxiliary verbs (have/do/can etc.) I think so / I hope so etc.
52 Question tags (do you? isn’t it? etc.)
[-ing and to ...]
53 Verb + -ing (enjoy doing / stop doing etc.)
54 Verb + to ... (decide to ... / forget to ... etc.)
55 Verb (+ object) + to ... (I want you to ...)
56 Verb + -ing or to ... 1 (remember, regret etc.)
57 Verb + -ing or to ... 2 (try, need, help)
58 Verb + -ing or to ... 3 (like / would like etc.)
59 prefer and would rather
60 Preposition (in/for/about etc.) + -ing
61 be/get used to ... (I’m used to ...)
62 Verb + preposition + -ing (succeed in -ing / insist on -ing etc.)
63 there’s no point in -ing, it’s worth -ing etc.
64 to ..., for ... and so that ...
65 Adjective + to ...
66 to ... (afraid to do) and preposition + -ing (afraid of -ing)
67 see somebody do and see somebody doing
68 -ing clauses (He hurt his knee playing football.)
[Articles and nouns]
69 Countable and uncountable 1
70 Countable and uncountable 2
71 Countable nouns with a/an and some
72 a/an and the
73 the 1
74 the 2 (school / the school etc.)
75 the 3 (children / the children)
76 the 4 (the giraffe / the telephone / the old etc.)
77 Names with and without the 1
78 Names with and without the 2
79 Singular and plural
80 Noun + noun (a bus driver / a headache)
81 -’s (your sister’s name) and of ... (the name of the book)
[Pronouns and determiners]
82 myself/yourself/themselves etc.
83 a friend of mine my own house on my own/by myself
84 there ... and it ...
85 some and any
86 no/none/any nothing/nobody etc.
87 much, many, little, few, a lot, plenty
88 all/all of most/most of no/none of etc.
89 both/both of neither/neither of either/either of
90 all every whole
91 each and every
[Relative clauses]
92 Relative clauses 1: clauses with who/that/which
93 Relative clauses 2: clauses with and without who/that/which
94 Relative clauses 3: whose/whom/where
95 Relative clauses 4: extra information clauses (1)
96 Relative clauses 5: extra information clauses (2)
97 -ing and -ed clauses (the woman talking to Tom, the boy injured in the accident)
[Adjectives and adverbs]
98 Adjectives ending in -ing and -ed (boring/bored etc.)
99 Adjectives: a nice new house, you look tired
100 Adjectives and adverbs 1 (quick/quickly)
101 Adjectives and adverbs 2 (well, fast, late, hard/hardly)
102 so and such
103 enough and too
104 quite, pretty, rather and fairly
105 Comparative 1 (cheaper, more expensive etc.)
106 Comparative 2 (much better / any better etc.)
107 Comparative 3 (as ... as / than)
108 Superlative (the longest, the most enjoyable etc.)
109 Word order 1: verb + object; place and time
110 Word order 2: adverbs with the verb
111 still anymore yet already
112 even
[Conjunctions and prepositions]
113 although though even though in spite of despite
114 in case
115 unless as long as provided
116 as (as I walked ... / as I was ... etc.)
117 like and as
118 like as if
119 during for while
120 by and until by the time ...
[Prepositions]
121 at/on/in (time)
122 on time and in time at the end and in the end
123 in/at/on (position) 1
124 in/at/on (position) 2
125 in/at/on (position) 3
126 to, at, in and into
127 in/on/at (other uses)
128 by
129 Noun + preposition (reason for, cause of etc.)
130 Adjective + preposition 1
131 Adjective + preposition 2
132 Verb + preposition 1 to and at
133 Verb + preposition 2 about/for/of/after
134 Verb + preposition 3 about and of
135 Verb + preposition 4 of/for/from/on
136 Verb + preposition 5 in/into/with/to/on
[Phrasal verbs]
137 Phrasal verbs 1 Introduction
138 Phrasal verbs 2 in/out
139 Phrasal verbs 3 out
140 Phrasal verbs 4 on/off (1)
141 Phrasal verbs 5 on/off (2)
142 Phrasal verbs 6 up/down
143 Phrasal verbs 7 up (1)
144 Phrasal verbs 8 up (2)
145 Phrasal verbs 9 away/back
`);

const advanced = parseBook({
  id: "advanced-grammar-in-use-4",
  title: "Advanced Grammar in Use",
  edition: "Fourth Edition",
  officialLevel: "C1–C2",
  sortOrder: 3,
  expectedUnitCount: 105,
}, String.raw`
[Tenses]
1 Present continuous and present simple: state verbs and performatives
2 Using present continuous and present simple
3 Past simple and present perfect
4 Past continuous and past simple
5 Past perfect and past simple
6 Present perfect continuous and present perfect
7 Past perfect continuous, past perfect and past continuous
8 Present and past time: review
[The future]
9 Will and be going to
10 Present simple and present continuous for the future
11 Future continuous, future perfect and future perfect continuous
12 Be to + infinitive; be about to + infinitive
13 Other ways of talking about the future
14 The future seen from the past
[Modals and semi-modals]
15 Can, could, be able to and be allowed to
16 Will, would and used to
17 May and might
18 Must and have (got) to
19 Need(n’t), don’t need to and don’t have to
20 Should, ought to and had better
[Linking verbs, passives, questions]
21 Linking verbs: be, appear, seem; become, get, etc.
22 Using passives
23 Forming passive sentences: objects, complements and multi-word verbs
24 Forming passive sentences: verb + -ing or to-infinitive
25 Reporting with passives; It is said that ...
26 Wh-questions with who, whom, which, how and whose
27 Negative questions; echo questions; questions with that-clauses
[Verb complementation: what follows verbs]
28 Verbs, objects and complements
29 Verb + two objects
30 Verb + -ing forms and infinitives 1
31 Verb + -ing forms and infinitives 2
[Reporting]
32 Reporting people’s words and thoughts
33 Reporting statements: that-clauses
34 Verb + wh-clause
35 Tense choice in reporting
36 Reporting offers, suggestions, orders, intentions, etc.
37 Modal verbs in reporting
38 Reporting what people say using nouns and adjectives
39 Should in that-clauses; the present subjunctive
[Nouns]
40 Agreement between subject and verb 1
41 Agreement between subject and verb 2
42 Agreement between subject and verb 3
43 Compound nouns and noun phrases
[Articles, determiners and quantifiers]
44 A/an and one
45 A/an, the and zero article 1
46 A/an, the and zero article 2
47 A/an, the and zero article 3
48 Some and any
49 No, none (of) and not any
50 Much (of), many (of), a lot of, lots (of), etc.
51 All (of), whole, every, each
52 Few, little, less, fewer
[Relative clauses and other types of clause]
53 Relative pronouns
54 Other relative words: whose, when, whereby, etc.
55 Prepositions in relative clauses
56 Other ways of adding information to noun phrases 1: additional noun phrases, etc.
57 Other ways of adding information to noun phrases 2: prepositional phrases, etc.
58 Participle clauses with adverbial meaning 1
59 Participle clauses with adverbial meaning 2
[Pronouns, substitution and leaving out words]
60 Reflexive pronouns: herself, himself, themselves, etc.
61 One and ones
62 So and not as substitutes for clauses, etc.
63 Do so; such
64 More on ellipsis after auxiliary verbs
65 Ellipsis of to-infinitives
[Adjectives and adverbs]
66 Position of adjectives
67 Gradable and non-gradable adjectives: using adjectives with adverbs
68 Gradable and non-gradable adjectives: differences in meaning
69 Participle adjectives and compound adjectives
70 Adjectives + to-infinitive, -ing, that-clause, wh-clause
71 Adjectives and adverbs
72 Adjectives and adverbs: comparative and superlative forms
73 Comparative phrases and clauses
74 Position of adverbs: end position
75 Position of adverbs: front and mid position
76 Adverbs of place, direction, indefinite frequency, and time
77 Degree adverbs and focus adverbs
78 Comment adverbs and viewpoint adverbs
[Adverbial clauses and conjunctions]
79 Adverbial clauses of time
80 Giving reasons: as, because, etc.; for and with
81 Purposes and results: in order to, so as to, etc.
82 Contrasts: although and though; even though / if; while, whilst and whereas
83 If: real and unreal conditionals
84 If: other conditional patterns with if
85 If I were you ...; imagine he were to win
86 If ... not and unless; if and whether; etc.
87 Connecting ideas in a sentence and between sentences
[Prepositions]
88 Prepositions of position and movement
89 Between and among
90 Prepositions of time
91 Talking about exceptions
92 Prepositions after verbs
93 Prepositions after nouns
94 Multi-word verbs: word order
[Organising information]
95 There is, there was, etc.
96 It as subject (introductory It)
97 It as object (referring forward): It is / was no versus There is / was no ...
98 Focusing: it-clauses and what-clauses
99 Inversion 1
100 Inversion 2
[Grammar in academic contexts]
101 Complex noun phrases and complex prepositions
102 Expressing and reporting opinions: it-clauses
103 Linking ideas in academic writing and speech
104 Referring to other work and sections in academic writing and speaking
105 Academic discussion: lead-in phrases
`);

export const rawGrammarBooks = [essential, english, advanced];
export const grammarCatalogBooks = rawGrammarBooks.map(compileGrammarBook);
