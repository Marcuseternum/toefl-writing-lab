(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ToeflData=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){return {
  prompts: [
    {id:'e1',type:'email',title:'预约冲突 · 请求调整',prompt:`You are a student working on a group research project. Your group reserved a meeting room for Thursday afternoon, but the booking system now shows that another group has the same reservation. Your presentation is on Friday.
Write an email to Ms. Chen, the library's room-booking coordinator. In your email:
• Explain the reservation problem and why the meeting is important.
• Describe when your group could meet instead.
• Ask for a practical solution and say what information you can provide.
To: Ms. Chen
Subject: Help with a meeting-room reservation`},
    {id:'e2',type:'email',title:'社团活动 · 邀请合作',prompt:`You help organize a campus photography club. Your club plans to hold a free beginner workshop next month, and you would like the student arts center to help.
Write an email to Mr. Rivera, the arts center manager. In your email:
• Explain the workshop's purpose and who it is for.
• Describe the support your club needs from the arts center.
• Suggest a way the arts center would benefit from the collaboration.
To: Mr. Rivera
Subject: Collaboration on a beginner photography workshop`},
    {id:'e3',type:'email',title:'课程材料 · 澄清要求',prompt:`You are preparing a short presentation for a course. The assignment page says to use two sources, but an announcement from your professor says to use three. The presentation is due next week.
Write an email to Professor Wilson. In your email:
• Explain the conflicting information you found.
• Ask for clarification about the source requirement.
• Describe your current preparation and what you plan to do once the requirement is clear.
To: Professor Wilson
Subject: Clarification about presentation sources`},
    {id:'e4',type:'email',title:'宿舍噪声 · 提出解决方案',prompt:`The shared study room in your residence hall has recently become noisy in the evenings. You and other students need a quiet place to prepare for upcoming exams.
Write an email to Sam, the residence hall assistant. In your email:
• Describe the problem and its effect on students.
• Suggest a reasonable change to how the room is used.
• Offer to help make the change work.
To: Sam
Subject: Evening use of the shared study room`},
    {id:'d1',type:'discussion',title:'大学教育 · 实践与课堂',prompt:`Professor Allen:
Our class is discussing how universities should prepare students for their careers. Some universities are considering making an internship a requirement for graduation. Should all university students be required to complete an internship? Why or why not?

Maya:
I support this requirement. Internships let students see how ideas from class are used at work. They also help students understand which careers they actually enjoy before they graduate.

Daniel:
I disagree. Some students already have jobs or family responsibilities. An additional unpaid internship could make it difficult for them to finish their degree. Universities should offer internships without requiring them.

Write your contribution to the discussion. Express and support your opinion in your own words.`},
    {id:'d2',type:'discussion',title:'城市政策 · 免费公交',prompt:`Professor Reed:
Cities are looking for ways to reduce traffic and air pollution. One proposal is to make public transportation free for everyone. Is this a good use of a city's budget? Why or why not?

Lena:
Yes. Free buses and trains would encourage more people to stop driving. They would also help residents who cannot afford a car reach jobs and essential services.

Omar:
I am not convinced. Price is not the only reason people drive. If buses are slow or unreliable, people will still prefer their cars. The city should spend the money improving service instead.

Write your contribution to the discussion. Express and support your opinion in your own words.`},
    {id:'d3',type:'discussion',title:'学习科技 · AI 的使用',prompt:`Professor Brooks:
Many students now use AI tools while studying. Some teachers allow AI for brainstorming but not for writing final assignments. What is the most useful rule a university could introduce for student use of AI, and why?

Nora:
Students should explain how they used AI whenever they submit an assignment. This would make their work more transparent and help teachers distinguish a student's thinking from generated material.

Ethan:
I think students should demonstrate their understanding in a short oral conversation after major assignments. A disclosure statement alone does not show that a student has learned anything.

Write your contribution to the discussion. Express and support your opinion in your own words.`},
    {id:'d4',type:'discussion',title:'环境行为 · 奖励还是收费',prompt:`Professor Patel:
Our class is studying ways to reduce single-use packaging. A university can either give students a small discount when they bring reusable containers or charge a small fee for disposable containers. Which approach would be more effective, and why?

Grace:
Discounts would be better because they make sustainable behavior feel rewarding. Students may be more willing to keep using reusable containers when they receive a positive benefit.

Leo:
A fee would be more effective. Many students ignore small rewards, but they notice an extra cost every time they buy a meal. The fee could also fund additional washing facilities.

Write your contribution to the discussion. Express and support your opinion in your own words.`}
  ],
  sentences: [
    {question:'What did the tutor ask you?',bank:['the draft','she','finished','had','whether','I','asked','did'],answers:['She asked whether I had finished the draft.'],note:'间接疑问句采用陈述语序；过去完成时表示此前已完成。'},
    {question:'Why do you like the new classroom?',bank:['has','a room','large windows','it','that','is','does'],answers:['It is a room that has large windows.'],note:'that引导定语从句，修饰room。'},
    {question:'Can you come to the workshop?',bank:['if','I','my assignment','can attend','finish','I','will'],answers:['I can attend if I finish my assignment.'],note:'if条件从句用一般现在时表示将来的条件。'},
    {question:'What should we do before the experiment?',bank:['read','to','we','need','the instructions','carefully','reading'],answers:['We need to read the instructions carefully.'],note:'need to后接动词原形。'},
    {question:'Why was the talk moved online?',bank:['was','the speaker','because','it','could not','travel','although'],answers:['It was because the speaker could not travel.'],note:'because引导原因从句，could not后接动词原形。'}
  ],
  sources: [
    {title:'ETS 最新邮件与学术讨论评分标准',url:'https://www.ets.org/content/dam/ets-org/pdfs/toefl/writing-rubrics.pdf',note:'2025版，邮件与讨论各0–5档；工具使用精简转述。'},
    {title:'ETS 2026 考试规格',url:'https://www.eu.ets.org/pdfs/toefl/toefl-ibt-test-specifications-2026.pdf',note:'新版题型、12道写作题与约23分钟。'},
    {title:'ETS 新版教师练习卷 1',url:'https://www.ets.org/content/dam/ets-org/pdfs/toefl/toefl-ibt-teachers-resources-practice-test-1.pdf',note:'邮件和讨论见PDF第29、30页（纸面页码28、29）；分别7、10分钟。'},
    {title:'ETS 学术讨论题与带分样例（2023材料）',url:'https://www.ets.org/pdfs/toefl/toefl-ibt-writing-practice-sets.pdf',note:'学术讨论样例见PDF第11–13页；其中综合写作不属于2026新版。'},
    {title:'ETS 教师资源总入口',url:'https://www.ets.org/toefl/teachers-advisors-agents/ibt/teaching/preparing-students.html',note:'更多官方练习卷与教学材料。'},
    {title:'ETS 2026 正式成绩尺度',url:'https://www.ets.org/toefl/test-takers/ibt/scores/understand-scores.html',note:'2026年1月21日起各科1–6分，半分递增；不能把作文单题分直接换算为科目分。'}
  ]
};});
