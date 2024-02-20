import { Schema, model } from 'mongoose';

const ID_Schema = Schema({
        _id:{
            type: Schema.Types.ObjectId,
            auto: true
        },
        jiraIssueID: {
            type: String,
            required: true
        },
        freshServiceID: {
            type: String,
            required: true
        },
        updated: {
            type: Boolean,
            default: false
        }

    }
);


const ID_data = model('ID_data', ID_Schema);
export default ID_data;