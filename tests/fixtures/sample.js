// Sample clients for the interface and browser tests. The app itself starts with no clients;
// tests load this file into the page and skip the sign-in screen.
clients.splice(0,clients.length,
 {id:'pk-works',name:'PK Works',initials:'PK',color:'purple-art',logo:'#e9e6ff',text:'#665dc8',desc:'Creative strategy, digital marketing, and web experiences.',posts:18,accounts:3,channels:['f','in','𝕏']},
 {id:'bright-school-kits',name:'Bright School Kits',initials:'BS',color:'coral-art',logo:'#ffebe8',text:'#c96a62',desc:'School supply kits that help classrooms start strong.',posts:26,accounts:3,channels:['f','◎','▶']},
 {id:'revere-rum',name:'Revere Rum',initials:'RR',color:'gold-art',logo:'#fff3d8',text:'#b68625',desc:'Craft rum, people, place, and stories behind the bottle.',posts:14,accounts:2,channels:['f','◎']},
 {id:'stem-story-kits',name:'STEM Story Kits',initials:'SS',color:'green-art',logo:'#e3f7ed',text:'#269c74',desc:'Hands-on engineering adventures inspired by books.',posts:22,accounts:4,channels:['f','◎','in','▶']},
 {id:'client-sandbox',name:'Client Sandbox',initials:'CS',color:'blue-art',logo:'#e8f1ff',text:'#5078c6',desc:'A sample workspace for testing new content workflows.',posts:6,accounts:0,channels:[]}
);
document.body.classList.remove('signed-out');
if(typeof renderWorkspace==='function')renderWorkspace();
