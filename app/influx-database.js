const DEBUG = process.env.DEBUG ? process.env.DEBUG==='YES' : true
const Influx = require('influx')
let connection = null
let tachometerTick = 30
const gsMin = 1

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

function influxDate(data){
    
    if(typeof data.utc === 'string' && typeof data.position_utc === 'string'){
        const year = '20' + data.position_utc.substring(4)
		const month =  data.position_utc.substring(2,4)
		const day = data.position_utc.substring(0,2)
		const hour = data.utc.substring(0,2)
		const minute =  data.utc.substring(2,4)
        const second =  data.utc.substring(4,6)
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);   
    }else{
        return new Date()
    }

}

const connect = (config,dataInterval=30) => {
    if(!config){
        throw "Unable to use null config for influxdb."
    }

    tachometerTick = dataInterval

    connection = new Influx.InfluxDB(
        Object.assign({
            schema: [
                {
                    measurement: 'speed',
                    fields: { value: Influx.FieldType.FLOAT },
                    tags: ['unit','lat','long']
                },
                {
                    measurement: 'duration',
                    fields: { value: Influx.FieldType.INTEGER },
                    tags: ['unit','lat','long']
                }
            ]
        },config)
    )
}

const write = (records,model,retry) => {
    if( connection ){
        const filteredRecords = records.filter( (r) => {
            return isNumeric(r.gs)
        })
        return new Promise( (resolve, reject) => {
            if(connection){
                const queryPromises = filteredRecords.map( (record) => {
                    const duration = parseFloat(record.gs) > gsMin ? tachometerTick : 0
                    const ts = influxDate(record)

                    return connection.writePoints(
                        [
                            {
                                measurement: 'speed',
                                fields: {value: record.gs},
                                tags: {unit: record.imei, lat: record.lat_loc + record.lat, long: record.long_loc + record.long},
                                timestamp: ts
                            },
                            {
                                measurement: 'duration',
                                fields: {value: duration},
                                tags: {unit: record.imei, lat: record.lat_loc + record.lat, long: record.long_loc + record.long},
                                timestamp: ts
                            }
                        ]
                    )
                })

                Promise.all(queryPromises)
                    .then( () => {
                        if(DEBUG) console.log(`Wrote ${filteredRecords.length} record(s) to influxdb.`)
                        resolve()
                    })
                    .catch( (err) => {
                        if(DEBUG) console.log("Error: "+ err.code + " while writing to influxdb.")
                        reject(err)
                    })
            }
        })
    }
}

const disconnect = () => {
    connection = null
}

module.exports.connect = connect
module.exports.disconnect = disconnect
module.exports.write = (record,model) => write([record],model,0)