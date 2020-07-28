import React, {useState, useEffect} from 'react';
import {Face} from './face';
import glass1 from './img/glass1.png';
import glass2 from './img/glass2.png';
import glass3 from './img/glass3.png';
import glass5 from './img/glass5.png';
import noGlasses from './img/noglass.png';
import classNames from 'classnames';

interface Props{
    facedetector: Face
}

interface Glasses {
    name: string;
    img: string;
}

const availableGlasses = [
        {name: 'glass1', img: glass1},
        {name: 'glass2', img: glass2},
        {name: 'glass3', img: glass3},
        {name: 'glass5', img: glass5},
];

export const Items: React.FC<Props> = (props) => {
    const [glasses, _setGlasses] = useState(availableGlasses[0].name)
    useEffect( ()=> {props.facedetector.addElement(availableGlasses[0].name)}, [props.facedetector] )

    const setGlasses = (element: string) => {
        const current_item = glasses;
        if (current_item !== "") {
            props.facedetector.removeElement(current_item);
        }
        props.facedetector.addElement(element);
        _setGlasses(element);
    }
    const removeGlasses = () => {
        const current_item = glasses;
        if (current_item!=="") {
            props.facedetector.removeElement(current_item);
        }
        _setGlasses("");
    }
    const buttonList = (values: Glasses[]) => {
        const w = 350;
        const h = 200;
        const buttons = values.map(value => {
            const isActive = value.name === glasses;
            return (
                <div className={"item"} key={value.name}>
                    <img
                    className={classNames({isActive})}
                    src={value.img}
                    onClick={(e) => {setGlasses(value.name)}}
                    alt={value.name}
                    width={w}
                    height={h}
                    />
                </div>
            );
        });
        const isActive = glasses === "";
        buttons.unshift(
            <div key={"noglass"} className={"item"}>
                <img src={noGlasses} width={w} height={h} className={classNames({isActive})} onClick={removeGlasses} alt={"No glasses"}/>
            </div>
        )
        return buttons;
    }

    const elementList = buttonList(availableGlasses);
    return <div className="items">
                <div className="items-list">
                    {elementList}
    </div>
        </div>;
}
