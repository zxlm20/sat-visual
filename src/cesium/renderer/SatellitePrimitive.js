import * as Cesium from 'cesium'


export class SatellitePrimitive{


constructor(viewer){


this.viewer=viewer


this.collection=
new Cesium.PointPrimitiveCollection()



viewer.scene.primitives.add(
this.collection
)


}




addSatellite(data){


return this.collection.add({


position:data.position,


pixelSize:
data.size||6,


color:
data.color||Cesium.Color.GREEN



})


}




clear(){


this.collection.removeAll()


}



destroy(){


this.viewer.scene.primitives.remove(
this.collection
)


}



}