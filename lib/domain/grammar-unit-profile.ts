const PROFILE_OVERRIDES: Record<string, string[]> = {
  "english-grammar-in-use-5:1": ["使用 am / is / are + -ing 描述说话时正在发生的动作", "使用现在进行时描述当前阶段的暂时情况或变化"],
  "english-grammar-in-use-5:2": ["使用一般现在时描述习惯、重复行为和长期事实", "根据主语正确构成肯定句、否定句和动词形式"],
  "english-grammar-in-use-5:5": ["使用一般过去时描述在过去完成的动作或状态", "规则动词使用 -ed 形式，不规则动词使用对应的过去式"],
  "english-grammar-in-use-5:6": ["使用 was / were + -ing 描述过去某时正在进行的动作", "用过去进行时提供背景或表达被另一动作打断的过程"],
  "essential-grammar-in-use-4:27": ["使用 will 表达即时决定、预测和承诺", "在疑问句中使用 shall I / shall we 提出建议"],
  "essential-grammar-in-use-4:28": ["使用 will 表达将来事实和确定会发生的事情", "使用 will you 请求他人做事或询问意愿"],
  "english-grammar-in-use-5:3": ["使用现在进行时描述正在发生或暂时的情况", "使用一般现在时描述经常发生或长期成立的情况"],
  "english-grammar-in-use-5:4": ["根据说话者表达的变化、频率和态度选择现在进行时或一般现在时", "使用 always + 现在进行时表达反复发生且带有态度的行为"],
  "english-grammar-in-use-5:7": ["使用现在完成时连接过去发生的事情与现在的结果", "使用 have / has + 过去分词描述截至现在的经历或变化"],
  "english-grammar-in-use-5:8": ["使用现在完成时表达尚未结束的时间段内发生的事情", "使用 today、this week 等未结束时间语境选择现在完成时"],
  "english-grammar-in-use-5:12": ["使用 for + 时间段、since + 起始时间或从句，表示动作或状态持续了多久", "使用 When + 一般过去时询问开始时间，使用 How long + 现在完成时或现在完成进行时询问持续时间", "肯定句中的 for 有时可以省略；否定句中通常保留，也可以使用 in + 时间段", "使用 It’s / It’s been + 时间段 + since + 一般过去时表示距某事发生已有多久"],
  "english-grammar-in-use-5:13": ["用现在完成时表达与现在有关且时间未明确的过去事情", "用一般过去时表达发生在明确、已结束过去时间的事情"],
  "english-grammar-in-use-5:14": ["在提供过去细节或继续讲述过去事件时使用一般过去时", "根据谈话关注的是当前结果还是过去事件选择现在完成时或一般过去时"],
  "english-grammar-in-use-5:9": ["使用 have / has been + -ing 表达持续到现在或刚刚停止的活动", "根据当前可见结果说明此前持续进行的动作"],
  "english-grammar-in-use-5:10": ["根据关注活动过程还是完成结果选择现在完成进行时或现在完成时", "使用完成数量与持续时长等线索判断合适形式"],
  "english-grammar-in-use-5:11": ["使用 How long have you ...? 询问持续到现在的状态", "使用 How long have you been doing ...? 询问持续到现在的活动"],
  "english-grammar-in-use-5:15": ["使用 had + 过去分词表达在另一过去时间之前已完成的事情", "用过去完成时明确两个过去事件的先后"],
  "english-grammar-in-use-5:16": ["使用 had been + -ing 表达在过去某时之前持续进行的活动", "根据持续时间或过去结果选择过去完成进行时"],
  "english-grammar-in-use-5:17": ["使用 have 或 have got 表达拥有、关系和常见状态", "正确构成 have 与 have got 的否定句和疑问句"],
  "english-grammar-in-use-5:18": ["使用 used to + 动词原形表达过去经常发生但现在不再发生的事情", "区分 used to 与一般过去时描述过去习惯或状态"],
  "english-grammar-in-use-5:21": ["使用 will 表达即时决定、主动帮助、承诺或拒绝", "使用 I think / probably 等表达对未来的预测"],
  "english-grammar-in-use-5:22": ["使用 will 表达将来事实或说话者认为会发生的事情", "使用 shall I / shall we 提出建议，使用 will you 提出请求"],
  "english-grammar-in-use-5:29": ["使用 may / might 表达现在或将来的可能性", "使用 may not / might not 表达可能不会发生"],
  "english-grammar-in-use-5:30": ["使用 may / might be doing 表达可能正在发生", "使用 may / might have done 推测可能已经发生的过去事情"],
  "english-grammar-in-use-5:33": ["使用 should / shouldn’t 提出建议或表达合适做法", "使用 should 表达预期会发生的事情"],
  "english-grammar-in-use-5:34": ["使用 should have done 评价过去本应发生却未发生的事情", "使用 shouldn’t have done 评价过去不该发生却已发生的事情"],
  "english-grammar-in-use-5:44": ["使用被动语态中含双宾语、介词动词等较复杂结构", "根据句意选择主动或被动表达信息重点"],
  "english-grammar-in-use-5:47": ["使用 said (that) 转述陈述内容", "根据转述语境调整人称、时间地点表达和动词时态"],
  "english-grammar-in-use-5:48": ["转述内容现在仍然成立时可以保留原时态，也可以回退为过去时", "转述内容已经改变、结束或与事实不符时使用过去时态", "使用 say + 从句 / say something to somebody；使用 tell + somebody + 从句", "使用 tell / ask + somebody + (not) to-infinitive 转述命令或请求"],
  "english-grammar-in-use-5:49": ["使用助动词构成一般疑问句和特殊疑问句", "区分疑问词作主语与作宾语时的语序"],
  "english-grammar-in-use-5:69": ["区分可数名词与不可数名词及其基本限定词", "识别既可数又不可数但意义不同的名词"],
  "english-grammar-in-use-5:70": ["根据具体事物或一般概念选择可数或不可数用法", "可数名词按数量使用单复数，不可数名词不直接使用复数形式"],
  "english-grammar-in-use-5:77": ["判断人名、地名和机构名称前通常是否使用 the", "多数人名、城市、街道、单数国家和大陆名称前不使用 the"],
  "english-grammar-in-use-5:78": ["在复数国家、地理区域、河流、海洋等名称前使用 the", "根据场所、组织和建筑名称的构成选择是否使用 the"],
  "english-grammar-in-use-5:123": ["使用 in 表示处于区域、空间或容器内部", "使用 at 表示地点、活动点或具体位置"],
  "english-grammar-in-use-5:124": ["使用 on 表示位于表面、线路或楼层", "根据地点被看作区域、点还是表面选择 in / at / on"],
  "english-grammar-in-use-5:125": ["在常见地点和位置搭配中选择 in / at / on", "区分 at the front / back 与 in the front / back 等位置表达"],
  "english-grammar-in-use-5:130": ["使用 nice/kind/good/polite of somebody to do 与 nice/kind/good/polite to somebody", "使用 angry/annoyed/furious about something、with somebody、for doing", "使用 excited/worried/upset/nervous/happy about 与 pleased/satisfied/disappointed with", "使用 surprised/shocked/amazed at/by、impressed with/by、fed up/bored with 和 sorry about/for"],
  "english-grammar-in-use-5:131": ["使用 afraid/frightened/terrified/scared of 与 fond/proud/ashamed/jealous of", "使用 aware/conscious/capable/full/short of 与 good/bad/brilliant/hopeless at", "使用 married/engaged/similar to、different from、interested in 和 keen on", "使用 dependent on、crowded with、famous for 与 responsible for"],
  "advanced-grammar-in-use-4:30": ["根据动词搭配选择 -ing 形式或 to-infinitive", "使用动词后接宾语再接 -ing 或不定式的结构"],
  "advanced-grammar-in-use-4:31": ["区分接 -ing 与接不定式时意义发生变化的动词", "在完成、意图和结果等语境中选择正确补语形式"],
  "advanced-grammar-in-use-4:40": ["处理单数或复数形式明确的主语与谓语一致", "判断并列主语的谓语单复数"],
  "advanced-grammar-in-use-4:41": ["处理集合名词、数量表达和复数形式名词的主谓一致", "根据主语被看作整体还是成员选择谓语"],
  "advanced-grammar-in-use-4:42": ["处理复杂名词短语、不定代词和从句作主语时的主谓一致", "让谓语与真正的中心主语一致"],
  "advanced-grammar-in-use-4:45": ["根据首次提及、类别成员和职业身份选择 a / an", "在泛指与特指语境中选择冠词"],
  "advanced-grammar-in-use-4:46": ["根据共同已知、唯一事物和后置限定选择 the", "在一般概念和复数类别表达中使用零冠词"],
  "advanced-grammar-in-use-4:47": ["在机构、地点、交通和固定表达中选择 a / an、the 或零冠词", "根据同一名词的功能意义或具体地点意义选择冠词"],
  "advanced-grammar-in-use-4:58": ["使用现在分词分句表达同时发生、原因或结果", "确保分词分句的逻辑主语与主句主语一致"],
  "advanced-grammar-in-use-4:59": ["使用过去分词和完成分词分句表达被动或先发生的动作", "根据动作先后和主动被动关系选择分词形式"],
  "advanced-grammar-in-use-4:99": ["在否定或限制性表达置于句首时使用主谓倒装", "使用 never、rarely、only 等触发的倒装结构"],
  "advanced-grammar-in-use-4:100": ["在条件句、省略 if 和方向地点表达中使用倒装", "根据正式语体和信息焦点选择倒装结构"],
};

const DISTINCTIVE_RULES: Record<string, string> = {
  "essential-grammar-in-use-4:3": "现在进行时使用 am/is/are + 动词-ing，描述说话时正在发生的动作",
  "essential-grammar-in-use-4:8": "用现在进行时表达当前暂时情况，用一般现在时表达习惯、事实或长期状态",
  "essential-grammar-in-use-4:7": "一般现在时疑问句使用 Do/Does + 主语 + 动词原形",
  "essential-grammar-in-use-4:49": "间接问句使用疑问词 + 主语 + 谓语的陈述语序，不使用 do/does/did 倒装",
  "essential-grammar-in-use-4:29": "使用 might + 动词原形表达现在或将来不确定的可能性",
  "essential-grammar-in-use-4:30": "使用 can 表示现在能力或许可，使用 could 表示过去能力或较委婉请求",
  "essential-grammar-in-use-4:31": "区分 must、mustn’t 与 don’t need to：必须、禁止和没有必要",
  "essential-grammar-in-use-4:32": "使用 should/shouldn’t + 动词原形提出建议或评价合适做法",
  "essential-grammar-in-use-4:44": "根据时态选择 be、have 或 do 构成一般疑问句和简短回答",
  "essential-grammar-in-use-4:45": "疑问词作主语时不加 do/does/did；作宾语时使用助动词倒装",
  "essential-grammar-in-use-4:46": "介词宾语疑问句可将介词保留在句末；What is ... like? 询问特征",
  "essential-grammar-in-use-4:47": "使用 What/Which 询问事物或选择，使用 How + 形容词/副词询问程度",
  "essential-grammar-in-use-4:52": "want/need/decide 后接 to-infinitive，enjoy/finish/stop 后接动词-ing",
  "essential-grammar-in-use-4:112": "形容词或介词后接动词时使用介词 + 动词-ing，如 good at doing",
  "essential-grammar-in-use-4:113": "掌握 listen to、look at、wait for 等 verb + preposition 固定搭配",
  "essential-grammar-in-use-4:54": "使用 to-infinitive 表达行动目的，如 went to the shop to buy ...",
  "essential-grammar-in-use-4:65": "单数可数名词首次泛指时使用 a/an，按后接音素选择 a 或 an",
  "essential-grammar-in-use-4:69": "首次提到单数可数事物用 a/an，再次或明确指代时用 the",
  "essential-grammar-in-use-4:70": "使用 the 指双方都知道、前文已提到或语境中唯一的人或事物",
  "essential-grammar-in-use-4:71": "go to work/school、go home 等功能性地点不用 the；go to the cinema 等使用 the",
  "essential-grammar-in-use-4:73": "多数城市、国家和街道名称不用 the；河流、海洋和复数国家名称使用 the",
  "essential-grammar-in-use-4:90": "最高级使用 the + -est 或 the most + 形容词，并按规则处理不规则形式",
  "essential-grammar-in-use-4:67": "可数名词用 a/an 或复数数量表达，不可数名词可用 some 或量词短语",
  "essential-grammar-in-use-4:68": "同一名词可因含义不同采用可数或不可数形式，如 a cake、some cake、some cakes",
  "essential-grammar-in-use-4:77": "not ... any 与 no + 名词意义相近；none 可单独代替名词",
  "essential-grammar-in-use-4:78": "not ... anybody/anything 与 nobody/nothing 意义相近，后者不再搭配否定谓语",
  "essential-grammar-in-use-4:87": "使用 -er 或 more + 形容词构成比较级，并处理 good/better 等不规则形式",
  "essential-grammar-in-use-4:88": "使用比较级 + than 比较两个对象，宾格代词可接在 than 后",
  "essential-grammar-in-use-4:99": "真实或可能的将来条件使用 if + 一般现在时，主句使用 will/can/祈使句",
  "essential-grammar-in-use-4:100": "假设现在或将来不太真实的情况使用 if + 一般过去时，主句使用 would + 动词原形",
  "essential-grammar-in-use-4:103": "时间点使用 at，日期和星期使用 on，月份、年份和较长时期使用 in",
  "essential-grammar-in-use-4:106": "使用 in 表示在空间、城市或国家内部，at 表示具体地点或活动点，on 表示表面",
  "essential-grammar-in-use-4:107": "区分 in bed/in hospital 等状态地点与 at home/at work 等固定地点表达",
  "essential-grammar-in-use-4:108": "移动目的地使用 to，到达使用 arrive in/at；home/here/there 前不使用 to",
  "essential-grammar-in-use-4:111": "掌握 on holiday、at the age of、by car、with a key、about a problem 等常用搭配",

  "english-grammar-in-use-5:20": "使用 be going to 表达事先决定的计划，或依据当前证据作预测",
  "english-grammar-in-use-5:23": "临时决定和主观看法常用 will，已有计划或当前证据常用 be going to",
  "english-grammar-in-use-5:24": "will be doing 表示将来某时正在进行，will have done 表示届时已经完成",
  "english-grammar-in-use-5:36": "使用 would 描述过去视角中的将来、过去反复行为或假设结果",
  "english-grammar-in-use-5:37": "用 Can/Could/Would you ...? 提请求，用 Shall I ...? / Can I ...? 提供帮助或请求许可",
  "english-grammar-in-use-5:26": "can/could 表能力；具体一次成功可用 was/were able to，许可可用 be allowed to",
  "english-grammar-in-use-5:27": "could + 动词原形表示可能或一般能力；could have + 过去分词表示过去可能但未发生",
  "english-grammar-in-use-5:28": "must + 动词原形表示肯定推断，can’t + 动词原形表示不可能推断",
  "english-grammar-in-use-5:32": "mustn’t 表示禁止，needn’t/don’t need to 表示没有必要，意义不能互换",
  "english-grammar-in-use-5:38": "第一条件句用 if + 一般现在时；第二条件句用 if + 一般过去时和 would + 动词原形",
  "english-grammar-in-use-5:39": "使用 if + 一般过去时 / wish + 一般过去时表达与现在事实相反的假设或愿望",
  "english-grammar-in-use-5:40": "使用 if + had + 过去分词 / wish + had + 过去分词表达过去反事实或遗憾",
  "english-grammar-in-use-5:42": "一般现在时和一般过去时被动分别使用 am/is/are done 与 was/were done",
  "english-grammar-in-use-5:43": "根据时态使用 be done、being done 或 been done 等被动形式",
  "english-grammar-in-use-5:45": "用 It is said that ... 或主语 + is said to ... 转述普遍说法，用 be supposed to 表示预期或规定",
  "english-grammar-in-use-5:55": "want/expect/ask/tell + object + to-infinitive；部分动词也可直接接 to-infinitive",
  "english-grammar-in-use-5:50": "间接问句保留疑问词或使用 if/whether，并采用主语 + 谓语的陈述语序",
  "english-grammar-in-use-5:52": "反意疑问句使用与陈述句相反的肯否形式，并匹配助动词与代词主语",
  "english-grammar-in-use-5:53": "enjoy、avoid、finish、suggest 等动词后接动词-ing；stop doing 表示停止该动作",
  "english-grammar-in-use-5:54": "decide、hope、promise、refuse 等动词后接 to-infinitive",
  "english-grammar-in-use-5:56": "remember/regret doing 指回顾已发生的事，remember/regret to do 指要做或通知某事",
  "english-grammar-in-use-5:57": "try doing 表示尝试方法，try to do 表示努力完成；need doing 可表达被动含义",
  "english-grammar-in-use-5:58": "like doing 表示一般喜好，would like to do 表示具体愿望或选择",
  "english-grammar-in-use-5:63": "使用 there’s no point in doing、it’s worth doing、have difficulty doing 等固定 -ing 结构",
  "english-grammar-in-use-5:68": "使用 -ing 分句表达伴随动作、方式或原因，其逻辑主语与主句主语一致",
  "english-grammar-in-use-5:60": "介词后接动词时使用 -ing，包括 in/for/about + doing",
  "english-grammar-in-use-5:62": "掌握 succeed in doing、insist on doing、think of doing 等 verb + preposition + -ing 搭配",
  "english-grammar-in-use-5:66": "区分 afraid to do 与 afraid of doing：不敢采取行动与担心某事发生",
  "english-grammar-in-use-5:132": "掌握 talk/speak to、listen to、apologise to 与 throw/shout at 等 to/at 搭配",
  "english-grammar-in-use-5:133": "掌握 talk/read about、ask/pay for、approve of、look after 等动词介词搭配",
  "english-grammar-in-use-5:134": "区分 hear about/of、think about/of、dream about/of 等 about 与 of 搭配含义",
  "english-grammar-in-use-5:135": "掌握 accuse of、apply for、suffer from、depend on 等动词介词搭配",
  "english-grammar-in-use-5:136": "掌握 believe in、divide into、provide with、prefer to、concentrate on 等搭配",
  "english-grammar-in-use-5:64": "使用 to/in order to 表目的，for + 名词表示用途，so that + 从句表达目的或预期结果",
  "english-grammar-in-use-5:114": "使用 in case + 一般现在时表示为可能情况预先准备，不与 if 的条件含义混用",
  "english-grammar-in-use-5:119": "during + 名词表示期间，for + 时间段表示持续，while + 从句连接同时事件",
  "english-grammar-in-use-5:121": "at 用于钟点，on 用于日期或星期，in 用于月份、年份和较长时期",
  "english-grammar-in-use-5:126": "移动方向使用 to/into，位置使用 at/in；arrive 后使用 at 或 in",
  "english-grammar-in-use-5:127": "掌握 in a picture、on a list、at the top 等 in/on/at 的扩展固定用法",
  "english-grammar-in-use-5:65": "使用 adjective + to-infinitive 表达反应、难易或做某事的意愿",
  "english-grammar-in-use-5:99": "多个形容词放在名词前时按观点、大小、年龄、颜色、来源和材料等顺序排列",
  "english-grammar-in-use-5:72": "首次提到某类中的一个用 a/an，双方明确或再次提到时使用 the",
  "english-grammar-in-use-5:73": "使用 the 指语境中唯一、双方已知或由后置短语明确限定的人或事物",
  "english-grammar-in-use-5:74": "school/prison/hospital 等表示其通常功能时可不用 the，指具体建筑时使用 the",
  "english-grammar-in-use-5:75": "复数名词和不可数名词泛指时不用 the，指特定群体或事物时使用 the",
  "english-grammar-in-use-5:76": "用 the + 单数名词代表物种或发明，用 the + 形容词代表一类人",
  "english-grammar-in-use-5:92": "使用 who/that 指人，which/that 指物；关系词在从句中作主语时不能省略",
  "english-grammar-in-use-5:93": "关系词在限定性从句中作宾语时可以省略；介词可保留在从句末",
  "english-grammar-in-use-5:94": "使用 whose 表所属、whom 作正式宾语、where 指地点关系",
  "english-grammar-in-use-5:95": "非限定性关系从句用逗号补充信息，不能用 that，也不能省略关系词",
  "english-grammar-in-use-5:96": "非限定性关系从句可用介词 + whom/which，也可用 which 指代前面整个事实",
  "english-grammar-in-use-5:100": "形容词修饰名词或位于连系动词后，副词修饰动词、形容词或其他副词",
  "english-grammar-in-use-5:101": "区分 good/well、fast、late/lately、hard/hardly 等形容词副词及意义变化",
  "english-grammar-in-use-5:105": "短形容词用 -er，长形容词用 more，并掌握 good/better 等不规则比较级",
  "english-grammar-in-use-5:107": "使用 as ... as 表同等比较，使用比较级 + than 表差异，并避免重复比较形式",
  "english-grammar-in-use-5:108": "使用 the + -est 或 the most + 形容词构成最高级，并用 in/of 限定比较范围",
  "english-grammar-in-use-5:110": "频率副词通常位于实义动词前、be 动词后；部分副词位于句首或句末",
  "english-grammar-in-use-5:120": "by 表示不晚于期限完成，until 表示持续到期限；by the time 引出参照事件",
  "english-grammar-in-use-5:122": "区分 on time/in time 与 at the end/in the end：准时、及时、末端和最终",
  "english-grammar-in-use-5:137": "识别 phrasal verb 的 verb + particle 结构，并判断意义能否由各部分直接推断",
  "english-grammar-in-use-5:138": "掌握 in/out 表进入、出现、熄灭或用尽等含义的常用短语动词",
  "english-grammar-in-use-5:139": "掌握 find out、work out、point out、run out 等含 out 的常用短语动词",
  "english-grammar-in-use-5:140": "掌握 go on、carry on、put on 与 take off 等 on/off 短语动词",
  "english-grammar-in-use-5:141": "掌握 show off、tell off、see off、call off 等 on/off 短语动词",
  "english-grammar-in-use-5:142": "用 up/down 表示增加减少、上升下降或完成，并掌握对应常用短语动词",
  "english-grammar-in-use-5:143": "掌握 give up、end up、take up、make up 等含 up 的常用短语动词",
  "english-grammar-in-use-5:144": "掌握 bring up、grow up、set up、clear up 等含 up 的常用短语动词",
  "english-grammar-in-use-5:145": "掌握 throw away、put away、go away 及 give back、pay back 等 away/back 短语动词",

  "advanced-grammar-in-use-4:2": "区分临时变化、反复行为和长期状态，决定使用现在进行时还是一般现在时",
  "advanced-grammar-in-use-4:65": "在 want/hope/expect 等结构后，只保留 to 或省略可由上下文恢复的 to-infinitive 内容",
  "advanced-grammar-in-use-4:14": "使用 would、was/were going to、was/were to 等结构表达过去视角中的将来",
  "advanced-grammar-in-use-4:39": "在 demand/suggest/essential 等正式结构后的 that 从句中使用 should 或动词原形虚拟式",
  "advanced-grammar-in-use-4:17": "may/might + 动词原形表可能，may/might have + 过去分词推测过去",
  "advanced-grammar-in-use-4:18": "区分 must 与 have got to 的说话者要求、外部必要性和时态限制",
  "advanced-grammar-in-use-4:20": "区分 should/ought to 的建议与 had better 针对具体情况的警告性建议",
  "advanced-grammar-in-use-4:37": "转述时按时间关系把 will/can/may 等情态动词调整为 would/could/might 或保留原式",
  "advanced-grammar-in-use-4:23": "被动句中保留宾语补语、双宾语和 multi-word verb 的必要成分与介词",
  "advanced-grammar-in-use-4:24": "make/see 等主动结构改为被动时使用 to-infinitive，并处理 verb + -ing 的被动形式",
  "advanced-grammar-in-use-4:27": "使用否定疑问表达预期或惊讶，用 echo question 复述确认，并在 that 从句后构成问句",
  "advanced-grammar-in-use-4:33": "使用 reporting verb + that-clause 转述陈述，并根据动词决定 that 是否可省略",
  "advanced-grammar-in-use-4:36": "用 offer to、suggest doing/that、tell/order somebody to 等结构转述不同言语行为",
  "advanced-grammar-in-use-4:38": "使用 reporting noun/adjective + that-clause 或 to-infinitive 转述观点和评价",
  "advanced-grammar-in-use-4:56": "用同位名词短语、同位语从句等在中心名词后补充身份或解释信息",
  "advanced-grammar-in-use-4:60": "区分反身代词的同一指代、强调用法与 each other 的相互关系",
  "advanced-grammar-in-use-4:93": "掌握 reason for、increase in、effect on、solution to 等 noun + preposition 搭配",
  "advanced-grammar-in-use-4:101": "构造含多个前后置修饰语的复杂名词短语，并使用 in addition to 等复杂介词",
  "advanced-grammar-in-use-4:68": "同一形容词可因可分级或不可分级含义不同而搭配不同程度副词",
  "advanced-grammar-in-use-4:69": "区分 -ing/-ed 分词形容词，并按中心意义构成 compound adjective",
  "advanced-grammar-in-use-4:71": "根据修饰名词、连系动词补语或修饰动作的功能选择形容词或副词",
  "advanced-grammar-in-use-4:72": "按音节和词形构成比较级、最高级，并处理不规则与可替换形式",
  "advanced-grammar-in-use-4:75": "频率、程度和焦点副词通常位于主语后、实义动词前或第一个助动词后",
  "advanced-grammar-in-use-4:76": "地点方向副词多置句末，不定频率副词多置句中，时间副词按信息重点安排",
  "advanced-grammar-in-use-4:77": "用 very/extremely 等程度副词修饰等级，用 only/even/also 等焦点副词限定成分",
  "advanced-grammar-in-use-4:78": "用 fortunately/frankly 等 comment adverb 评价整句，用 politically/personally 等表达视角",
  "advanced-grammar-in-use-4:79": "使用 when/while/before/after/until 等时间从句，并按事件先后选择时态",
  "advanced-grammar-in-use-4:84": "使用 if + should、if + happen to、if it were not for 等扩展条件结构",
  "advanced-grammar-in-use-4:85": "使用 If I were you 提建议，使用 were to 表示较不可能或正式的假设",
  "advanced-grammar-in-use-4:86": "区分 unless 与 if ... not，以及条件意义的 if 与选择意义的 whether",
  "advanced-grammar-in-use-4:90": "按钟点、日期、时期和期限选择 at/on/in/by/until 等时间介词",
  "advanced-grammar-in-use-4:92": "掌握 depend on、belong to、result in/from 等 verb + preposition 搭配",
};

function normalizedTopic(title: string) {
  return title.replace(/\s+[1-9]\d*(?=\s*(?:\(|$))/, "").trim();
}

function inferredLearningContents(title: string): string[] {
  const topic = normalizedTopic(title);
  const lower = topic.toLocaleLowerCase("en");
  if (/^am\/is\/are$/.test(lower)) return ["使用 am / is / are 构成 be 动词的一般现在时肯定句", "根据 I、单数和复数主语选择 am、is 或 are", "使用 be + 名词、形容词、年龄或地点说明身份、状态和位置"];
  if (lower === "am/is/are (questions)") return ["将 am / is / are 放在主语前构成一般疑问句", "使用 Am I ...?、Is he/she/it ...?、Are you/we/they ...? 匹配不同主语", "使用疑问词 + am/is/are + 主语构成特殊疑问句"];
  if (/^i am doing/.test(lower)) return ["使用 am / is / are + 动词-ing 构成现在进行时", "用现在进行时描述说话时正在发生或当前阶段暂时发生的动作", "根据主语选择 am / is / are，并按规则构成动词-ing 形式"];
  if (/^are you doing/.test(lower)) return ["使用 am / is / are + 主语 + 动词-ing 构成现在进行时疑问句", "使用 What / Where / Why 等疑问词询问正在进行的动作", "用 Yes, ... am/is/are 或 No, ... am not/isn’t/aren’t 作简短回答"];
  if (/^i do\/work\/like/.test(lower)) return ["使用动词原形描述习惯、重复行为、状态和事实", "第三人称单数主语后使用动词的 -s / -es 形式", "结合 usually、often、every day 等频率或重复时间表达使用一般现在时"];
  if (/^i don’t/.test(lower)) return ["使用 do not / don’t + 动词原形构成一般现在时否定句", "第三人称单数使用 does not / doesn’t + 动词原形", "be 动词和情态动词的否定不使用 do / does"];
  if (/^do you/.test(lower)) return ["使用 Do / Does + 主语 + 动词原形构成一般现在时疑问句", "第三人称单数疑问句使用 does，实义动词恢复原形", "使用 do / does 构成肯定或否定简短回答"];
  if (/^i have .*i’ve got/.test(lower) || lower === "have and have got") return ["使用 have / has 或 have got / has got 表示拥有、关系和常见状态", "使用 do/does not have 或 haven’t/hasn’t got 构成否定", "使用 Do/Does ... have? 或 Have/Has ... got? 构成疑问"];
  if (lower === "was/were") return ["使用 was / were 构成 be 动词的一般过去时", "单数主语通常使用 was，you 和复数主语使用 were", "使用 was not / were not 构成否定，将 was / were 提到主语前构成疑问"];
  if (/^worked\/got\/went/.test(lower)) return ["使用动词过去式描述过去已经完成的动作", "规则动词通常加 -ed，不规则动词使用各自的过去式", "肯定句中的所有人称都使用相同的过去式形式"];
  if (/^i didn’t/.test(lower)) return ["使用 did not / didn’t + 动词原形构成一般过去时否定句", "使用 Did + 主语 + 动词原形构成一般过去时疑问句", "出现 did / didn’t 后实义动词不再使用过去式"];
  if (/^i was doing/.test(lower) && !lower.includes("and i did")) return ["使用 was / were + 动词-ing 构成过去进行时", "用过去进行时描述过去某一时刻正在进行的动作", "根据主语选择 was 或 were，并按规则构成动词-ing 形式"];
  if (/^i was doing.*and i did/.test(lower)) return ["使用过去进行时描述正在进行的背景动作", "使用一般过去时描述完成的动作或中途发生的事件", "用 when 或 while 连接背景过程与发生的动作"];
  if (/^i have done/.test(lower) && !lower.includes("and i did")) return ["使用 have / has + 过去分词构成现在完成时", "用现在完成时表达过去发生但与现在有关的经历、变化或结果", "根据主语选择 have / has，并使用规则或不规则过去分词"];
  if (/^i’ve just/.test(lower)) return ["使用 have / has just + 过去分词表达刚刚完成的事情", "使用 have / has already + 过去分词表达事情已经发生", "在否定句和疑问句中使用 yet 表达尚未发生或询问是否已经发生"];
  if (/^have you ever/.test(lower)) return ["使用 Have / Has + 主语 + ever + 过去分词询问截至现在的经历", "使用 never 与现在完成时表达从未有过的经历", "回答具体发生时间或细节时改用一般过去时"];
  if (/^how long have you/.test(lower)) return ["使用 How long have / has + 主语 + 过去分词询问状态持续多久", "使用 How long have / has + 主语 + been + 动词-ing 询问活动持续多久", "用 for + 时间段或 since + 起始点回答持续时间"];
  if (lower === "for since ago") return ["使用 for + 时间段表示持续时长，使用 since + 起始时间表示从何时开始", "for / since 常与现在完成时连用，表示持续到现在的状态或动作", "使用 ago + 时间段并搭配一般过去时，表示距现在多久以前"];
  if (/^is done was done/.test(lower)) return ["使用 be + 过去分词构成被动语态", "使用 am/is/are done 表达现在的被动，使用 was/were done 表达过去的被动", "被动句的主语是动作承受者，必要时用 by 引出动作执行者"];
  if (/^is being done/.test(lower)) return ["使用 am/is/are being + 过去分词构成现在进行时被动", "使用 was/were being + 过去分词构成过去进行时被动", "使用 have/has been + 过去分词构成现在完成时被动"];
  if (/^be\/have\/do/.test(lower)) return ["根据主语和时间选择 be、have、do 的现在时或过去时形式", "be 可作主要动词或进行时、被动语态助动词", "have 可表示拥有或构成完成时，do 可作主要动词或构成否定与疑问"];
  if (lower === "regular and irregular verbs") return ["规则动词使用 -ed 构成一般过去式和过去分词", "不规则动词的过去式和过去分词需要使用对应形式", "根据时态结构区分动词原形、过去式和过去分词"];
  if (/^what are you doing tomorrow/.test(lower)) return ["使用现在进行时表达已经安排好的将来计划", "句中通常包含 tomorrow、tonight 等将来时间表达", "该用法强调已有安排，而不是说话时正在进行"];
  if (lower.includes("going to")) return ["使用 am/is/are going to + 动词原形表达已经决定的计划或意图", "根据当前证据使用 be going to 预测即将发生的事情", "根据主语变化 be 动词，并在 going to 后使用动词原形"];
  if (/^do this!/.test(lower)) return ["使用动词原形开头构成肯定祈使句，表达指令或请求", "使用 Don’t + 动词原形构成否定祈使句", "使用 Let’s + 动词原形提出共同建议"];
  if (lower.startsWith("there is there are")) return ["使用 there is + 单数或不可数名词，使用 there are + 复数名词", "使用 there isn’t / aren’t 构成否定，将 is / are 提前构成疑问", "使用 some 表示肯定数量，使用 any 表示否定句或疑问句中的数量"];
  if (lower.startsWith("there was/were")) return ["使用 there was / were 表示过去存在的人或事物", "使用 there has/have been 表示截至现在曾经存在或发生", "使用 there will be 表示将来会存在或发生"];
  if (lower === "it ...") return ["使用 it 指代已提到的事物、动物或情况", "使用 it 表示时间、日期、距离和天气", "使用 it is + 形容词 + to-infinitive 表达对某事的评价"];
  if (/^i am, i don’t/.test(lower)) return ["用 am/is/are、do/does 等助动词构成简短回答", "简短回答中的助动词与问句和主语保持一致", "避免在简短回答中重复完整的实义动词短语"];
  if (/^have you\?/.test(lower)) return ["用助动词 + 主语构成回应式短问句", "短问句中的助动词与前句时态和结构一致", "根据语气使用肯定或否定短问句表示兴趣、惊讶或确认"];
  if (lower.startsWith("too/either")) return ["在肯定句末使用 too，在否定句末使用 either 表示“也”", "使用 so + 助动词 + 主语回应肯定陈述", "使用 neither + 助动词 + 主语回应否定陈述"];
  if (lower.startsWith("isn’t, haven’t")) return ["在 be、have 和情态动词后加 not 构成否定", "一般现在时和一般过去时使用 don’t/doesn’t/didn’t + 动词原形", "根据助动词形成 isn’t、haven’t、can’t 等常用缩写"];
  if (lower.startsWith("how long does it take")) return ["使用 How long does/did it take ...? 询问所需时间", "使用 It takes/took + 人 + 时间 + to-infinitive 表达完成某事需要多久", "根据发生时间选择 take、takes 或 took"];
  if (lower.startsWith("do you know where")) return ["在 Do you know ...?、I don’t know ... 等间接问句中使用陈述语序", "保留 where、what、when 等疑问词，但不再倒装助动词和主语", "一般疑问含义使用 if / whether 引导间接问句"];
  if (lower.startsWith("she said that")) return ["使用 say + (that) 从句转述内容，say 后不直接接听话对象", "使用 tell + 人 + (that) 从句说明信息告诉了谁", "根据转述时间调整人称、时态和时间地点表达"];
  if (lower.startsWith("work/working")) return ["在进行时中使用 be + 动词-ing", "在 like、enjoy、finish 等特定动词后使用动词-ing", "根据拼写规则直接加 -ing、去 e 加 -ing 或双写末尾辅音"];
  if (lower === "get") return ["使用 get + 名词表示得到、收到或买到", "使用 get + 形容词表示状态发生变化", "使用 get to + 地点或 get home/here/there 表示到达"];
  if (lower === "do and make") return ["使用 do 表示工作、任务和一般活动，如 do homework", "使用 make 表示制作、产生和形成结果，如 make a mistake", "掌握 do / make 与常见名词的固定搭配"];
  if (lower === "have") return ["使用 have 表示拥有以及经历状态或事件", "使用 have breakfast、have a shower、have a good time 等固定搭配", "使用 have to + 动词原形表达必要性"];
  if (/^i\/me he\/him/.test(lower)) return ["主格代词 I/he/she/we/they 作主语", "宾格代词 me/him/her/us/them 作动词或介词宾语", "根据代词在句中的功能选择主格或宾格"];
  if (/^my\/his\/their/.test(lower)) return ["使用 my/your/his/her/its/our/their + 名词表示所属", "形容词性物主代词不能单独使用，后面必须接名词", "根据拥有者而不是被拥有事物选择物主代词"];
  if (lower.startsWith("whose is this")) return ["使用 Whose ...? 询问所属关系", "使用 mine/yours/his/hers/ours/theirs 单独指代所属物", "名词性物主代词后不再接名词"];
  if (lower === "i/me/my/mine") return ["使用 I 等主格作主语，使用 me 等宾格作宾语", "使用 my 等形容词性物主代词修饰名词", "使用 mine 等名词性物主代词替代“物主代词 + 名词”"];
  if (lower.includes("myself/yourself/themselves")) return ["主语和宾语指同一人时使用反身代词", "使用 by + 反身代词表达独自完成", "根据人称和单复数选择 myself、yourself、himself、herself、ourselves、themselves"];
  if (lower.startsWith("-’s")) return ["使用 ’s 表示人或动物的所属关系", "复数名词以 -s 结尾时只添加撇号表示所属", "无生命事物通常使用 the ... of ... 表达所属或组成关系"];
  if (lower.includes("singular and plural") || lower.startsWith("train(s)")) return ["可数名词单数通常需要限定词，复数通常加 -s / -es", "根据词尾规则构成 -ies、-ves 等复数形式", "使用 children、men、women 等常见不规则复数"];
  if (lower.startsWith("i like music")) return ["复数可数名词不加 the 可以泛指一类人或事物", "不可数名词不加 the 可以泛指某种事物或概念", "谈论特定对象时使用 the + 名词"];
  if (lower.startsWith("this/that/these/those")) return ["使用 this / that 指代单数或不可数事物", "使用 these / those 指代复数事物", "根据距离或语篇远近选择 this/these 或 that/those"];
  if (lower === "one/ones" || lower.startsWith("one and ones")) return ["使用 one 替代前文提到的单数可数名词", "使用 ones 替代前文提到的复数可数名词", "one / ones 可与形容词、this/that 或 the 等限定语连用"];
  if (lower === "some and any") return ["肯定句通常使用 some，否定句和一般疑问句通常使用 any", "表示主动提供或期待肯定回答的请求中可以使用 some", "some / any 可修饰复数可数名词和不可数名词"];
  if (lower.startsWith("not + any") || lower.startsWith("no/none/any")) return ["使用 not ... any 或 no + 名词表达“没有”", "使用 none 单独代替没有的人或事物，使用 none of + 限定词/代词", "避免在同一标准句中同时使用否定动词和 no / none"];
  if (lower.includes("anybody/anyone/anything") || lower.includes("nothing/nobody")) return ["否定句和疑问句通常使用 anybody/anyone/anything", "使用 nobody/no-one/nothing 表达没有任何人或事物", "nobody/no-one/nothing 本身含否定意义，谓语不用额外否定"];
  if (lower.startsWith("somebody/anything/nowhere")) return ["使用 somebody/someone/something 表示不特定的人或事物", "使用 anybody/anyone/anything 常见于否定句、疑问句或“任何”含义", "使用 somewhere/anywhere/nowhere 表示不特定或不存在的地点"];
  if (lower === "every and all" || lower === "all every whole") return ["使用 every + 单数可数名词，谓语通常用单数", "使用 all + 复数可数名词或不可数名词", "使用 the whole + 单数名词表达完整整体"];
  if (lower.startsWith("all most some any") || lower.startsWith("all/all of")) return ["all/most/some/any/no 可直接放在一般名词前", "与代词或限定词连用时使用 all/most/some/any/none of", "根据名词可数性和数量含义选择合适限定词"];
  if (lower.startsWith("both either neither") || lower.startsWith("both/both of")) return ["使用 both 表示两者都，谓语通常用复数", "使用 either 表示两者中的任一个，使用 neither 表示两者都不", "与代词或限定词连用时可使用 both/either/neither of"];
  if (lower.startsWith("a lot much many") || lower.startsWith("much, many")) return ["使用 many 修饰复数可数名词，使用 much 修饰不可数名词", "a lot of / lots of / plenty of 可修饰复数可数名词和不可数名词", "肯定句通常偏向 a lot of，疑问句和否定句常用 much / many"];
  if (lower.includes("little") && lower.includes("few")) return ["使用 few / a few 修饰复数可数名词", "使用 little / a little 修饰不可数名词", "few/little 表示几乎没有，a few/a little 表示有一些"];
  if (lower.startsWith("old/older") || lower.startsWith("older than")) return ["短形容词通常加 -er 构成比较级，长形容词通常使用 more + 形容词", "使用比较级 + than 明确两个对象的比较", "按拼写规则处理 -y 变 -ier、双写辅音以及不规则比较级"];
  if (lower.startsWith("not as")) return ["使用 as + 形容词/副词原级 + as 表示同等程度", "使用 not as/so + 原级 + as 表示程度不及另一对象", "该结构使用原级，不使用比较级"];
  if (lower === "enough") return ["enough 放在名词前表示数量足够", "enough 放在形容词或副词后表示程度足够", "使用 enough + to-infinitive 或 enough for somebody 表达足以完成某事"];
  if (lower === "too") return ["too + 形容词/副词表示程度过高并带来不合意结果", "too much + 不可数名词，too many + 复数可数名词", "使用 too + 形容词/副词 + to-infinitive 表达太……而不能"];
  if (lower.startsWith("still yet already")) return ["still 通常位于实义动词前、be 动词后，表示情况仍在继续", "yet 通常用于否定句或疑问句句末，表示尚未或已经", "already 通常用于肯定句，位于助动词后、主要动词前，表示已经"];
  if (lower.startsWith("give me that book")) return ["可使用 verb + person + thing 表达把某物给某人", "也可使用 verb + thing + to/for + person", "宾语是代词时通常使用 give it to me，而不是 give me it"];
  if (lower.startsWith("and but or")) return ["使用 and 连接并列或顺承信息，使用 but 连接转折信息", "使用 or 表示选择，使用 so 表示结果，使用 because 表示原因", "连接两个分句时根据逻辑关系选择连词并保持句子结构完整"];
  if (lower === "when ...") return ["使用 when 引导时间从句，表达某事发生的时间", "谈论将来时，when 从句使用一般现在时而不用 will", "主句与 when 从句的时态根据事件时间和先后关系保持一致"];
  if (lower.startsWith("from ... to")) return ["使用 from ... to ... 表示起点和终点", "使用 until 表示动作或状态持续到某时间", "使用 since 表示起点并常搭配完成时，使用 for 表示持续时长"];
  if (lower.startsWith("before after during while")) return ["before / after 可作介词接名词，也可作连词接从句", "during 是介词，后接名词；while 是连词，后接主语和谓语", "根据两个事件的时间先后或同时关系选择 before、after、during 或 while"];
  if (lower.startsWith("under, behind")) return ["使用 under/below 表示下方，使用 above/over 表示上方", "使用 behind/in front of、opposite、between/among 表示相对位置", "介词后接名词或代词构成地点介词短语"];
  if (lower.startsWith("up, over, through")) return ["使用 up/down 表示上下方向，使用 over/under 表示越过或从下方经过", "使用 through 表示穿过内部，使用 across 表示横穿表面或区域", "根据移动路径和终点选择方向介词或副词"];
  if (lower.includes("present perfect continuous and simple")) return ["根据关注持续过程还是完成结果，选择现在完成进行时或现在完成时", "结合时长、次数和当前结果正确构成动词形式"];
  if (lower.includes("present continuous and present simple")) return ["根据动作是当前暂时发生还是经常、长期成立，选择现在进行时或一般现在时", "结合时间线索和状态动词正确构成句子"];
  if (lower.includes("past continuous") && lower.includes("past simple")) return ["用过去进行时交代过去正在进行的背景，用一般过去时表达完成或插入的动作", "根据动作过程和事件先后选择正确时态"];
  if (lower.includes("present perfect") && lower.includes("past")) return ["根据事情与现在是否相关、过去时间是否明确，选择现在完成时或一般过去时", "在继续讲述过去细节时保持时态一致"];
  if (lower.startsWith("present continuous")) return ["使用 be + -ing 描述当前正在进行或暂时发生的事情", "根据主语和时间语境正确构成现在进行时"];
  if (lower.startsWith("present simple")) return ["使用一般现在时描述习惯、重复行为、状态或事实", "根据主语正确选择动词原形或第三人称单数形式"];
  if (lower.startsWith("past continuous")) return ["使用 was / were + -ing 描述过去某时正在进行的动作", "用过去进行时交代背景、并行动作或被打断的过程"];
  if (lower.startsWith("past simple")) return ["使用一般过去时描述过去已经完成的动作或状态", "规则动词使用 -ed 形式，不规则动词使用对应的过去式"];
  if (lower.startsWith("present perfect continuous")) return ["使用 have / has been + -ing 表达持续到现在或刚停止的活动", "根据持续时间和当前结果判断该形式是否合适"];
  if (lower.startsWith("present perfect")) return ["使用 have / has + 过去分词连接过去事件与当前情况", "结合经历、变化、结果和未结束时间选择现在完成时"];
  if (lower.startsWith("past perfect continuous")) return ["使用 had been + -ing 表达在过去某时之前持续进行的活动", "根据持续过程和过去结果正确组织事件先后"];
  if (lower.startsWith("past perfect")) return ["使用 had + 过去分词表达在另一过去时间之前已完成的事情", "用过去完成时明确两个过去事件的先后"];
  if (lower.startsWith("passive") || lower.includes("passive sentences") || lower.includes("using passives")) return ["在动作承受者或结果更重要时使用被动语态", "根据时态和句型正确构成 be + 过去分词"];
  if (lower.includes("reported") || lower.startsWith("reporting")) return ["把他人的话、想法或意图转换为合适的转述结构", "根据转述语境调整动词、从句、人称和时间表达"];
  if (lower.includes("question")) return ["根据疑问词和句子功能正确选择助动词与语序", "构成语法完整、意图明确的疑问句"];
  if (lower.includes("relative")) return ["使用合适的关系词连接名词与说明它的从句", "根据关系词在从句中的作用决定结构和是否可省略"];
  if (lower.includes("countable") || lower.includes("uncountable")) return ["根据名词意义判断可数或不可数用法", "正确搭配单复数、冠词和数量词"];
  if (lower.includes("article") || /(^|\s)(a\/an|the|zero article)(\s|$)/.test(lower)) return ["根据泛指、特指和名词类别选择 a / an、the 或零冠词", "在完整语境中判断是否需要冠词"];
  if (lower.includes("preposition") || /^(in|at|on|by|during|for|to),?\b/.test(lower)) return ["根据时间、位置、方向或固定搭配选择介词", "介词后接名词、宾格代词或动词-ing 形式"];
  if (lower.includes("adjective") && lower.includes("adverb")) return ["根据修饰对象和句法位置选择形容词或副词", "正确构成并放置目标形式"];
  if (lower.includes("adjective")) return ["根据形容词的句法功能和语义选择正确形式", "把形容词放在名词或连系动词后的合适位置"];
  if (lower.includes("adverb")) return ["根据副词表达的意义选择合适形式", "把副词放在句首、句中或句末的正确位置"];
  if (lower.includes("comparative") || lower.includes("superlative")) return ["根据比较对象和程度选择比较级或最高级结构", "正确搭配 than、as ... as、the 和程度修饰语"];
  if (lower.includes("phrasal verb") || lower.includes("multi-word verb")) return ["根据语境理解并使用目标短语动词", "根据宾语类型正确安排动词、 particle 和宾语的顺序"];
  if (lower.includes("word order") || lower.includes("inversion")) return ["根据句子功能和信息重点使用正确语序", "正确安排主语、动词、宾语和修饰语的位置"];
  if (lower.includes("-ing") || lower.includes("infinitive") || lower.includes("to ...")) return ["根据前接词和句意选择 -ing 形式或不定式", "正确构成目标动词补语或非谓语结构"];
  if (lower.includes("noun")) return ["根据句法功能和意义正确构成目标名词结构", "正确处理名词的限定、单复数和修饰关系"];
  if (lower.startsWith("if") || lower.includes("conditional")) return ["根据条件的真实程度和时间关系选择条件句结构", "让条件从句与结果从句的时态和语气一致"];
  if (lower.includes("modal") || /^(can|could|may|might|must|should|would|will)\b/.test(lower)) return ["根据能力、可能性、义务、建议或推测等意义选择情态动词", "情态动词后接动词原形，情态完成式使用 modal + have + 过去分词"];
  if (lower.startsWith("when i do")) return ["谈论将来时，when/after/before/until/as soon as 从句使用一般现在时而不用 will", "使用现在完成时表示时间从句中的动作将在主句动作之前完成", "使用 if 表示不确定条件，使用 when 表示预期会发生的时间"];
  if (lower === "have to and must") return ["使用 must 表达说话者认为必要的义务或强烈要求", "使用 have to 表达由规则、环境或事实造成的必要性", "过去和将来的必要性使用 had to 或 will have to，不使用 must 的过去式或将来式"];
  if (lower.startsWith("’d better")) return ["使用 had better + 动词原形提出针对当前情况的强烈建议", "否定形式为 had better not + 动词原形", "使用 It’s time + 主语 + 一般过去时表达某事现在应该发生"];
  if (lower === "wish") return ["使用 wish + 一般过去时表达对现在情况与事实相反的愿望", "使用 wish + had + 过去分词表达对过去事情的遗憾", "使用 wish + would 表达希望某人或某种情况发生改变"];
  if (lower === "have something done") return ["使用 have + object + past participle 表示安排他人完成某事", "同一结构可表示主语经历了非自愿或不好的事情", "根据时间变化 have 的形式，宾语后的动词保持过去分词"];
  if (lower.startsWith("auxiliary verbs")) return ["使用助动词代替前文已经出现的动词短语，避免重复", "使用 I think so / I hope so 等 so 代替肯定从句", "使用 I don’t think so / I hope not 等结构代替否定从句"];
  if (lower === "prefer and would rather") return ["使用 prefer + 名词/动词-ing + to + 名词/动词-ing 表达一般偏好", "使用 would prefer + to-infinitive 表达具体情况下的偏好", "使用 would rather + 动词原形 + than ...，否定形式为 would rather not"];
  if (lower.startsWith("see somebody do")) return ["使用 see/hear/watch + somebody + 动词原形表示感知到动作的完整过程", "使用 see/hear/watch + somebody + 动词-ing 表示感知到动作正在进行", "被动形式使用 somebody was seen/heard + to-infinitive"];
  if (lower.startsWith("a friend of mine")) return ["使用 a friend of mine 等双重所有格表达“我的一个朋友”", "使用 my own + 名词强调属于自己，own 前必须有物主限定词", "使用 on my own / by myself 表示独自或独立完成"];
  if (lower === "there ... and it ...") return ["使用 there + be 引入尚未提到的人或事物", "使用 it 指代已经明确的人、事物或情况", "天气、时间和距离等无人称表达使用 it 作形式主语"];
  if (lower === "each and every") return ["each 和 every 后都接单数可数名词，谓语通常用单数", "each 强调个体，可单独使用或使用 each of；every 强调整体中的每一个", "两者中的每一个使用 each，不使用 every"];
  if (lower === "so and such") return ["使用 so + 形容词/副词，使用 such + (a/an) + 形容词 + 名词", "使用 so much/many/few/little + 名词表达程度", "使用 so ... that / such ... that 引出结果"];
  if (lower === "enough and too") return ["enough 放在名词前、形容词或副词后，表示数量或程度足够", "too 放在形容词或副词前，表示程度过高并产生不合意结果", "使用 enough/too + to-infinitive 或 for somebody + to-infinitive 表达结果"];
  if (lower.startsWith("quite, pretty")) return ["quite/pretty/rather/fairly + 可分级形容词或副词表示不同程度", "quite + a/an + 形容词 + 名词，rather 可用 rather a/an 或 a rather", "quite 与不可分级形容词连用时可表示“完全”"];
  if (lower.startsWith("still anymore")) return ["still 通常位于实义动词前、be 或助动词后，表示仍然持续", "not ... anymore/any longer 表示过去存在的情况现在不再持续", "yet 常用于否定句或疑问句句末，already 常位于助动词与主要动词之间"];
  if (lower === "even") return ["使用 even 强调出乎意料的人、事或程度", "even 通常位于被强调成分前，位于实义动词前或 be 动词后", "使用 even if / even though 分别表达即使条件和尽管事实"];
  if (lower.startsWith("although though")) return ["although/though/even though + 从句表示让步，不与 but 同时连接同一对分句", "in spite of/despite + 名词、代词或动词-ing，不直接接完整从句", "使用 in spite of/despite the fact that + 从句表达让步"];
  if (lower.startsWith("unless as long as")) return ["unless 表示 if ... not，引导否定条件", "as long as / provided (that) / providing (that) 表示条件得到满足", "条件从句谈论将来时通常使用一般现在时而不用 will"];
  if (lower.startsWith("as (as i walked")) return ["as + 从句可表示两个动作同时发生或一个过程伴随另一变化", "as 也可表示原因，相当于 because，但通常用于原因已知或不突出的情况", "根据语境区分 as 的时间含义与原因含义"];
  if (lower === "like and as") return ["like 作介词，后接名词或代词表示相似", "as 可作连词接从句，也可表示身份、用途或实际角色", "比较方式时使用 as + 从句；非正式表达中有时使用 like + 从句"];
  if (lower === "like as if") return ["使用 like + 名词/代词表示相似，使用 as if/as though + 从句描述看起来的情况", "与当前事实相反时，as if/as though 从句可使用一般过去时", "与过去事实相反时使用 as if/as though + had + 过去分词"];
  if (lower === "during for while") return ["during + 名词表示某个事件或时期之内", "for + 时间段表示动作或状态持续多久", "while + 主语 + 谓语连接两个同时发生的动作或状态"];
  if (lower.startsWith("by and until")) return ["by + 时间点表示不晚于该期限完成", "until + 时间点表示动作或状态持续到该时刻", "使用 by the time + 从句表达在另一事件发生前已经完成"];
  if (lower.startsWith("on time and in time")) return ["on time 表示按照预定时间、没有迟到", "in time 表示赶在太迟之前，in time for/to do 表示及时赶上", "at the end 表示某事物末端或末期，in the end 表示最终结果"];
  if (lower === "by") return ["by + 交通工具表示出行方式，by car/train/air 前通常不用冠词", "by + 人表示被动动作的执行者，with + 工具表示使用的工具", "by 还可表示截止时间、靠近位置或数量差额"];
  if (lower === "between and among") return ["between 通常表示两个或若干彼此独立对象之间", "among 表示处于一群或一组对象之中", "涉及明确的一对一关系或分别关系时，即使超过两个也可使用 between"];
  if (lower === "talking about exceptions") return ["使用 except (for) / apart from 表示排除的人或事物", "使用 except that / apart from the fact that 后接从句", "使用 but 表示“除……之外”时常跟在 nobody、nothing、all 等词后"];
  if (lower === "there is, there was, etc.") return ["使用 there + be 引入存在或发生的人、事物和情况", "be 的形式根据时间和后接名词变化为 is/are、was/were、has/have been 等", "与情态动词连用时使用 there may/must/can + be"];
  if (lower.startsWith("it as subject")) return ["使用 it 作形式主语，把 to-infinitive、-ing 或 that 从句移到句末", "使用 It + be + 形容词/名词 + 从句表达评价或判断", "天气、时间、距离等无人称表达使用 it 作主语"];
  if (lower.startsWith("it as object")) return ["使用 find/think/consider + it + 形容词/名词 + to-infinitive 或从句", "it 作形式宾语时指向后面的真正宾语内容", "区分 It is/was no ... 的形式主语结构与 There is/was no ... 的存在结构"];
  if (lower.startsWith("focusing: it-clauses")) return ["使用 It is/was + 焦点成分 + that/who 从句构成强调句", "使用 What + 从句 + be + 焦点成分突出事物或行为", "强调结构改变信息焦点，但不改变原句的基本事实和时态"];
  if (lower.startsWith("expressing and reporting opinions")) return ["使用 It + be + 形容词 + that 从句表达评价或立场", "使用 It is believed/argued/thought that ... 等被动结构转述观点", "根据证据强度和作者立场选择 likely、clear、possible 等评价词"];
  if (lower.startsWith("linking ideas in academic")) return ["使用 however/nevertheless 表示转折，therefore/thus 表示结果", "使用 furthermore/moreover/in addition 添加论点", "根据连接语位置使用逗号、分号或句号连接完整观点"];
  if (lower.startsWith("referring to other work")) return ["使用 according to、as X points out 等结构引用他人观点", "使用 above/below、previous/following 等词指向文章其他部分", "选择一般现在时、现在完成时或一般过去时呈现研究与文献观点"];
  if (lower.startsWith("academic discussion")) return ["使用 The aim/purpose of ... is to ... 引入主题或目的", "使用 It is important to note that ... 等结构提示重点或限定", "使用 This section examines/discusses ... 等主语结构组织学术论述"];
  if (lower === "present and past time: review") return ["使用一般时表达习惯、事实或完整事件，使用进行时表达正在发展或暂时的过程", "使用完成时把较早事件与现在或另一过去时点联系起来", "根据明确时间、持续时间和事件先后选择现在或过去时态"];
  if (lower.startsWith("future continuous")) return ["使用 will be + 动词-ing 表示将来某时正在进行或按常规会发生的动作", "使用 will have + 过去分词表示在将来某时之前已经完成", "使用 will have been + 动词-ing 强调截至将来某时的持续过程"];
  if (lower.startsWith("need(n’t)")) return ["使用 needn’t + 动词原形表示没有必要做某事", "使用 don’t need to / don’t have to + 动词原形表示不必做某事", "使用 needn’t have + 过去分词表示做了其实没有必要做的事"];
  if (lower.startsWith("linking verbs")) return ["be、seem、appear 等连系动词后接主语补语描述状态或特征", "become、get、grow、turn 等连系动词表示状态变化", "连系动词后通常接形容词而不是方式副词"];
  if (lower === "verbs, objects and complements") return ["及物动词后接直接宾语，不及物动词不直接接宾语", "使用 verb + object + complement 描述宾语的身份或状态", "根据动词搭配区分名词、形容词、to-infinitive 等补语形式"];
  if (lower === "verb + two objects") return ["使用 verb + indirect object + direct object 表达给某人某物", "也可使用 verb + direct object + to/for + recipient", "代词宾语和不同动词决定双宾语结构是否可转换"];
  if (lower === "verb + wh-clause") return ["know、ask、decide 等动词后可接 wh-word + 陈述语序从句", "wh 从句保留 who/what/how/whether 等连接词，不使用疑问句倒装", "在 know/decide 等动词后可使用 wh-word + to-infinitive"];
  if (lower === "tense choice in reporting") return ["报告动词为过去时时，常将现在时、过去时和情态动词向过去回退", "内容仍然成立或报告动词为现在时时，可以保留原时态", "根据事实是否改变以及报告时间选择是否进行时态回退"];
  if (lower.startsWith("no, none")) return ["使用 no + 名词表达没有任何人或事物", "使用 none 或 none of + 限定词/代词独立指代“一个也没有”", "使用 not ... any 与 no 表达同类否定，但标准句中不重复否定"];
  if (lower.startsWith("much (of)")) return ["much 修饰不可数名词，many 修饰复数可数名词", "a lot of / lots of 可修饰可数或不可数名词", "与限定词或代词连用时使用 much of / many of / a lot of"];
  if (lower.startsWith("all (of)")) return ["all 可修饰复数可数名词或不可数名词，whole 通常修饰单数整体", "every/each 后接单数可数名词，each 可使用 each of", "与代词或限定词连用时选择 all of，并根据中心名词决定谓语"];
  if (lower.startsWith("so and not as substitutes")) return ["使用 think/hope/suppose 等动词 + so 代替肯定从句", "使用 hope not 等结构代替否定从句，部分动词使用 don’t think so", "so / not 代替的是完整命题，不代替单独的名词短语"];
  if (lower === "do so; such") return ["使用 do so 代替前文已经出现的动作或动词短语", "使用 such 指代前文提到的类型或性质，常见结构为 such a/an + 名词", "根据正式程度和句法位置选择 do so、do it 或 such"];
  if (lower.startsWith("more on ellipsis")) return ["在助动词、be 或情态动词之后省略与前文相同的动词短语", "助动词的时态、情态和主语一致关系必须保留", "否定、比较和并列结构中只省略能够从上下文明确恢复的部分"];
  if (lower.startsWith("giving reasons")) return ["because + 从句直接说明原因，because of + 名词或动词-ing", "as / since + 从句用于读者较易预期或次要的原因", "for 可在独立分句后补充解释，with + 名词可说明伴随原因"];
  if (lower.startsWith("purposes and results")) return ["使用 to/in order to/so as to + 动词原形表达目的", "否定目的使用 in order not to / so as not to", "使用 so that + 从句表达目的，使用 so/such ... that 表达结果"];
  if (lower.startsWith("contrasts:")) return ["although/though/even though + 从句表达让步", "despite/in spite of + 名词或动词-ing，不直接接完整从句", "while/whereas 对照两个事实，even if 表达不影响结果的假设条件"];
  if (lower.startsWith("connecting ideas")) return ["使用 and、but、or、so 等并列连词连接同等结构或分句", "使用 however、therefore、moreover 等连接副词组织句间逻辑", "根据连接成分是短语、从句还是独立句选择标点和连接形式"];
  return [];
}

function supplementalLearningContents(title: string): string[] {
  const lower = normalizedTopic(title).toLocaleLowerCase("en");
  if (/present|past|future|tense|will|going to|used to|would/.test(lower)) return ["根据时间参照和句子含义选择时态，并保持助动词与动词形式一致"];
  if (/passive/.test(lower)) return ["根据时态变化 be 动词，主要动词始终使用过去分词"];
  if (/modal|\bcan\b|\bcould\b|\bmay\b|\bmight\b|\bmust\b|\bshould\b|\bought\b|\bneedn’t\b|\bhave to\b/.test(lower)) return ["情态动词后接动词原形；表达过去推测或评价时使用 modal + have + 过去分词"];
  if (/report/.test(lower)) return ["根据原话类型选择陈述从句、to-infinitive 或其他合适的转述结构"];
  if (/question|how|what|which|who|whose/.test(lower)) return ["根据疑问词在句中的作用决定是否使用助动词倒装"];
  if (/-ing|infinitive|verb \+|verb forms|complements/.test(lower)) return ["目标动词之后的补语形式由动词搭配和句意共同决定"];
  if (/article|a\/an|\bthe\b|noun|countable|plural/.test(lower)) return ["根据名词是否可数、单复数以及泛指或特指选择限定形式"];
  if (/pronoun|myself|yourself|mine|whose|\bi\/me\b/.test(lower)) return ["根据代词在句中作主语、宾语、限定语或独立指代选择形式"];
  if (/some|any|none|much|many|few|little|all|every|both|either|neither/.test(lower)) return ["根据名词可数性、单复数和肯定或否定含义选择数量表达"];
  if (/adjective|adverb|comparative|superlative|enough|too|\bas \.\.\. as/.test(lower)) return ["根据修饰对象和句法位置选择词形，并保持比较结构完整"];
  if (/preposition|\bin\b|\bon\b|\bat\b|during|while|since|for|between|among/.test(lower)) return ["根据介词后的名词、代词或动词-ing 形式构成完整介词短语"];
  if (/phrasal|multi-word/.test(lower)) return ["根据宾语是否为代词判断宾语应放在动词与 particle 之间还是之后"];
  if (/if|wish|unless|condition/.test(lower)) return ["根据真实、假设或反事实含义匹配条件从句与结果从句的时态"];
  if (/clause|connecting|although|because|purpose|reason|contrast/.test(lower)) return ["根据两个分句的逻辑关系选择连接形式，并保持从句结构完整"];
  if (/academic|opinion|focusing/.test(lower)) return ["使用与正式学术语体相符的从句、指代和连接结构"];
  return ["在肯定、否定和疑问结构中保持主语、助动词与主要动词形式一致"];
}

/**
 * Returns the version-controlled editorial scope attached to one official Unit.
 * The official title remains the authority; this summary only makes its practical
 * learning scope explicit for teachers and generation prompts.
 */
export function grammarUnitLearningContents(bookId: string, unitNumber: number, officialTitle: string) {
  const authored = PROFILE_OVERRIDES[`${bookId}:${unitNumber}`] ?? [];
  const distinctive = DISTINCTIVE_RULES[`${bookId}:${unitNumber}`];
  const core = [...new Set([...authored, ...(distinctive ? [distinctive] : []), ...inferredLearningContents(officialTitle)])];
  return (core.length >= 3 ? core : [...new Set([...core, ...supplementalLearningContents(officialTitle)])]).slice(0, 4);
}
