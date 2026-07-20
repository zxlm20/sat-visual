import { reactive, computed } from 'vue'


const state = reactive({



// ====================
// 星座配置
// ====================

 constellation:{


  leo:'',


  meo:'',


  geo:''


 },



// ====================
// 星历文件
// ====================

ephemeris:{


 leo:'',


 meo:'',


 geo:''


},




// ====================
// 业务配置
// ====================

business:{


 type:'',


 source:null,


 target:null


},




// ====================
// 半物理节点
// ====================

physical:{


 enabled:false,


 nodes:[],


 mode:'realtime',



 realtime:{


   ip:'',


   port:'',


   protocol:'TCP'


 },



 history:{


   path:''


 }


},




// ====================
// 负载均衡
// ====================

balance:{


 algorithm:'none',



 params:{}



}



})







function updateConfig(key,value){


 state[key]=value


}





function setConstellation(layer,value){


 state.constellation[layer]=value


}





function setEphemeris(layer,path){


 state.ephemeris[layer]=path


}





function setBalanceAlgorithm(type){


 state.balance.algorithm=type


}







export function useConfigStore(){


 return{


 state,


 constellation:
 computed(
 ()=>state.constellation
 ),


 ephemeris:
 computed(
 ()=>state.ephemeris
 ),


 physical:
 computed(
 ()=>state.physical
 ),


 balance:
 computed(
 ()=>state.balance
 ),



 updateConfig,


 setConstellation,


 setEphemeris,


 setBalanceAlgorithm


 }


}