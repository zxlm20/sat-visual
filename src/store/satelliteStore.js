import { reactive, computed } from 'vue'


const state = reactive({

  // 所有节点
  satellites: [],


  // 当前选中的卫星
  selectedSatellite: null,


  // 节点总数
  total: 0,


  // 更新时间
  updateTime: null

})


// ===============================
// 初始化模拟卫星数据
// 后期替换为WebSocket
// ===============================
function initMockSatellites(count = 100) {


  const list = []


  for(let i = 0; i < count; i++){

    const layer =
      i % 3 === 0 ? 'L':
      i % 3 === 1 ? 'M':
      'H'


    const orbitId =
      String(Math.floor(i / 10))
      .padStart(3,'0')


    const satId =
      String(i % 10)
      .padStart(3,'0')


    list.push({

      id:`${layer}${orbitId}${satId}`,


      name:`${layer}${orbitId}${satId}`,


      type:
      i % 20 ===0
      ? 'physical'
      :'virtual',


      orbitLayer:layer,


      constellation:
      layer==='L'
      ? '低轨星座'
      :
      layer==='M'
      ? '中轨星座'
      :
      '高轨星座',



      position:{


        lng:
        Math.random()*360-180,


        lat:
        Math.random()*180-90,


        alt:
        layer==='L'
        ?550
        :
        layer==='M'
        ?20000
        :
        36000

      },



      address:{


        ipv6:
        `2001:db8::${i}`,


        ipv4:
        `192.168.1.${i}`

      },



      resources:{


        cpu:
        Math.floor(Math.random()*100),


        npu:
        Math.floor(Math.random()*100),


        gpu:
        Math.floor(Math.random()*100),


        storage:
        Math.floor(Math.random()*100),


        cache:
        Math.floor(Math.random()*100)


      },



      load:{


        level:'normal',


        text:'正常'


      },



      linkCount:
      Math.floor(Math.random()*10),


      businessFlowCount:
      Math.floor(Math.random()*20),



      status:'online',


      alert:false,


      physical:false


    })

  }


  state.satellites = list

  state.total = list.length

  state.updateTime = Date.now()

}




// ===============================
// 根据ID查询
// ===============================
function getSatelliteById(id){


 return state.satellites.find(
    item=>item.id===id
 )

}



// ===============================
// 选择节点
// ===============================
function selectSatellite(id){


 state.selectedSatellite =
 getSatelliteById(id)


}



// ===============================
// 更新节点状态
// 后端WebSocket调用
// ===============================
function updateSatellite(data){


 const target =
 getSatelliteById(data.id)



 if(target){

    Object.assign(
      target,
      data
    )

 }


}



export function useSatelliteStore(){


 return{


   state,


   satellites:
   computed(()=>state.satellites),


   selectedSatellite:
   computed(()=>state.selectedSatellite),


   total:
   computed(()=>state.total),



   initMockSatellites,


   getSatelliteById,


   selectSatellite,


   updateSatellite


 }


}