import { reactive, computed } from 'vue'


const state = reactive({


 links: [],


 selectedLink:null


})





// ===============================
// 初始化模拟链路
// ===============================
function initMockLinks(satellites){


 const links=[]


 for(let i=0;i<satellites.length-1;i++){


   links.push({


    id:`LINK-${i}`,


    source:
    satellites[i].id,


    target:
    satellites[i+1].id,



    type:
    'ISL',



    bandwidth:1000,



    traffic:
    Math.floor(
      Math.random()*1000
    ),



    utilization:
    Math.random(),



    delay:
    Math.floor(
      Math.random()*100
    ),



    loss:
    Math.random()*0.01,



    status:'connected',



    level:
    getTrafficLevel()



   })

 }


 state.links=links


}





// 流量等级

function getTrafficLevel(value=0.5){


 if(value<0.2)
 return 'idle'


 if(value<0.4)
 return 'smooth'


 if(value<0.6)
 return 'normal'


 if(value<0.75)
 return 'mild'


 if(value<0.9)
 return 'moderate'


 return 'severe'


}






function selectLink(id){


 state.selectedLink =
 state.links.find(
 item=>item.id===id
 )


}




function updateLink(data){


 const link =
 state.links.find(
 item=>item.id===data.id
 )


 if(link){

   Object.assign(
     link,
     data
   )

 }


}





export function useLinkStore(){


 return{


  state,


  links:
  computed(()=>state.links),


  selectedLink:
  computed(()=>state.selectedLink),


  initMockLinks,


  selectLink,


  updateLink



 }


}