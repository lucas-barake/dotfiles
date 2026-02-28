function mic-reset
    echo "Restarting CoreAudio..."
    sudo killall coreaudiod
    while not SwitchAudioSource -t input -c >/dev/null 2>&1
        sleep 0.5
    end
    sleep 1
    SwitchAudioSource -t input -s "BlackHole 2ch"
    osascript -e 'set volume input volume 100'
    echo "Done. Default input: $(SwitchAudioSource -t input -c)"
end
